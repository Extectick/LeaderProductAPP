import { createHelpApi, HelpApiError, type HelpDetail } from './helpApi';
import { confirmHelpPending, saveHelpPending, helpRetryDelay } from './helpStorage';
import type { HelpPending } from './helpDurableTypes';
import { API_BASE_URL } from '@/utils/config';
const requests = new Map<string, Promise<HelpDetail>>();
/** A direct send and an automatic retry share the same in-flight request. */
export function dispatchHelpPending(userId: number, item: HelpPending): Promise<HelpDetail> {
    const key = `${API_BASE_URL}:${userId}:${item.key}`, existing = requests.get(key);
    if (existing)
        return existing;
    const work = (async () => {
        const api = createHelpApi(userId), sending = { ...item, status: 'sending' as const };
        await saveHelpPending(userId, sending);
        try {
            const detail = item.action === 'close' && item.ticketId ? await api.close(item.ticketId, { ...item.input, rating: item.input.rating ?? 0 }) : item.action === 'reopen' && item.ticketId ? await api.reopen(item.ticketId, item.input) : item.ticketId ? await api.send(item.ticketId, item.input) : await api.create(item.input);
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
