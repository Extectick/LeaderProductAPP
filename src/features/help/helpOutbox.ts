import { createHelpApi, uploadHelpFiles, HelpApiError, type HelpDetail } from './helpApi';
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
        const api = createHelpApi(userId);
        let sending = { ...item, status: 'sending' as const };
        await saveHelpPending(userId, sending);
        try {
            // Checkpoint each completed upload so retry never repeats earlier files.
            const uploadedFileIds = [...(item.uploadedFileIds ?? [])];
            for (const file of (item.localFiles ?? []).slice(uploadedFileIds.length)) {
                const [attachment] = await uploadHelpFiles([file], userId);
                if (!attachment) throw new Error('Сервер не подтвердил загрузку вложения');
                uploadedFileIds.push(attachment.id);
                sending = {...sending, uploadedFileIds: [...uploadedFileIds]};
                await saveHelpPending(userId, sending);
            }
            const input = {...item.input, attachmentIds: [...(item.input.attachmentIds ?? []), ...uploadedFileIds]};
            const detail = item.action === 'close' && item.ticketId ? await api.close(item.ticketId, { ...input, rating: input.rating ?? 0 }) : item.action === 'reopen' && item.ticketId ? await api.reopen(item.ticketId, input) : item.ticketId ? await api.send(item.ticketId, input) : await api.create(input);
            if(item.replyTo)detail.messages=detail.messages.map(message=>!message.replyTo&&((Boolean(item.input.clientMessageId)&&message.clientMessageId===item.input.clientMessageId)||message.replyToId===item.replyTo!.id)?{...message,replyToId:item.replyTo!.id,replyTo:item.replyTo!}:message);
            // Preserve local media geometry through acknowledgement; server metadata
            // may be incomplete until its asynchronous media inspection finishes.
            detail.messages=detail.messages.map(message=>message.clientMessageId===item.input.clientMessageId?{...message,attachments:message.attachments.map(attachment=>{
                const local=item.localFiles?.[uploadedFileIds.indexOf(attachment.id)];
                return local?{...attachment,width:attachment.width??local.width,height:attachment.height??local.height,durationMs:attachment.durationMs??local.durationMs}:attachment;
            })}:message);
            // The server has accepted the message. Paint its receipt immediately;
            // keep the durable acknowledgement awaited before resolving delivery.
            notifyAccepted(onAccepted, detail);
            await confirmHelpPending(userId, item.key, detail);
            if (item.localFiles?.length) {
                const drafts: typeof import('./helpAttachmentDrafts') = require('./helpAttachmentDrafts');
                await drafts.clearHelpAttachmentDraft(userId, `outbox:${item.key}`).catch(() => {});
            }
            return detail;
        }
        catch (error) {
            const terminal = error instanceof HelpApiError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
            const attempts = (item.attempts ?? 0) + 1;
            await saveHelpPending(userId, { ...sending, attempts, status: terminal ? 'failed' : 'queued', nextAttemptAt: terminal ? undefined : Date.now() + helpRetryDelay(attempts), error: error instanceof Error ? error.message : 'Не удалось отправить сообщение' });
            throw error;
        }
    })();
    requests.set(key, work);
    void work.finally(() => { if (requests.get(key) === work)
        requests.delete(key); }).catch(() => { });
    return work;
}
