import { createHelpApi, HelpApiError, type HelpDetail } from './helpApi';
import { confirmHelpPending, saveHelpPending, helpRetryDelay } from './helpStorage';
import type { HelpPending } from './helpDurableTypes';
import { API_BASE_URL } from '@/utils/config';
const requests = new Map<string, Promise<HelpDetail>>();
function notifyAccepted(observer: ((detail: HelpDetail) => void) | undefined, detail: HelpDetail) {
    try {observer?.(detail);} catch { /* UI observers cannot undo server acceptance. */ }
}
/** A direct send and an automatic retry share the same in-flight request. */
export function dispatchHelpPending(userId: number, item: HelpPending, onAccepted?: (detail: HelpDetail) => void): Promise<HelpDetail> {
    const key = `${API_BASE_URL}:${userId}:${item.key}`, existing = requests.get(key);
    if (existing)
        return onAccepted ? existing.then(detail => {notifyAccepted(onAccepted, detail); return detail;}) : existing;
    const work = (async () => {
        const api = createHelpApi(userId), sending = { ...item, status: 'sending' as const };
        await saveHelpPending(userId, sending);
        try {
            const detail = item.action === 'close' && item.ticketId ? await api.close(item.ticketId, { ...item.input, rating: item.input.rating ?? 0 }) : item.action === 'reopen' && item.ticketId ? await api.reopen(item.ticketId, item.input) : item.ticketId ? await api.send(item.ticketId, item.input) : await api.create(item.input);
            if(item.replyTo)detail.messages=detail.messages.map(message=>!message.replyTo&&((Boolean(item.input.clientMessageId)&&message.clientMessageId===item.input.clientMessageId)||message.replyToId===item.replyTo!.id)?{...message,replyToId:item.replyTo!.id,replyTo:item.replyTo!}:message);
            // The server has accepted the message. Paint its receipt immediately;
            // keep the durable acknowledgement awaited before resolving delivery.
            notifyAccepted(onAccepted, detail);
            await confirmHelpPending(userId, item.key, detail);
            return detail;
        }
        catch (error) {
            const terminal = error instanceof HelpApiError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
            const attempts = (item.attempts ?? 0) + 1;
            await saveHelpPending(userId, { ...item, attempts, status: terminal ? 'failed' : 'queued', nextAttemptAt: terminal ? undefined : Date.now() + helpRetryDelay(attempts), error: error instanceof Error ? error.message : 'Не удалось отправить сообщение' });
            throw error;
        }
    })();
    requests.set(key, work);
    void work.finally(() => { if (requests.get(key) === work)
        requests.delete(key); }).catch(() => { });
    return work;
}
