import { matchingSubmissionReceipt, type SubmissionReceipt } from './orderSubmissionProtocol';
import type { Delivery } from './orderOutboxDatabase';
import type { ClientOrder } from '@/utils/clientOrdersService';

export type OutboxStore = {
  claim: (userId: string, limit: number) => Promise<Delivery[]>;
  accept: (item: Delivery, receipt: SubmissionReceipt) => Promise<void>;
  fail: (item: Delivery, failure: { retryable: boolean; message: string; code?: string; details?: any }) => Promise<void>;
  accepted: (userId: string) => Promise<Delivery[]>;
  status: (item: Delivery, receipt: SubmissionReceipt) => Promise<void>;
  complete: (item: Delivery, order: ClientOrder, legacy?: boolean) => Promise<void>;
};
export type OutboxTransport = {
  capabilities: () => Promise<{ enabled: boolean; protocol: string }>;
  upload: (items: Delivery[]) => Promise<any[]>;
  statuses: (ids: string[]) => Promise<any[]>;
  order: (receipt: SubmissionReceipt) => Promise<ClientOrder>;
};
function uploadFailure(error: any) {
  const retryable = error?.name === 'AccountChangedError' || !error?.status
    || [401,408,425,429,499,500,502,503,504].includes(error.status);
  return { retryable, message: retryable ? 'Отправка будет повторена после восстановления связи.'
    : error?.message || 'Проверьте документ перед отправкой.', code: error?.backendErrorCode, details: error?.errorDetails };
}

/** No React state, navigation, alerts, or 1C waiting on the main upload path. */
export async function drainOrderOutbox(options: {
  userId: string; store: OutboxStore; transport: OutboxTransport;
  isCurrent: () => boolean; maxDurationMs?: number;
}) {
  const { store, transport, userId, isCurrent } = options;
  const deadline = Date.now() + (options.maxDurationMs ?? 100_000);
  if (!isCurrent()) return;
  const capabilities = await transport.capabilities();
  if (capabilities.protocol !== 'client-order-inbox-v1' || !isCurrent()) return;
  // Upload ALL ready packets first; never await 1C before the next document.
  for (let batch = 0; capabilities.enabled && batch < 20 && Date.now() < deadline && isCurrent(); batch++) {
    const items = await store.claim(userId, 10);
    if (!items.length) break;
    const modern = items;
    if (modern.length && isCurrent()) {
      try {
        const results = await transport.upload(modern);
        for (const item of modern) {
          const receipt = results.find(result => result.clientOrderId === item.clientOrderId
            && result.clientRevision === item.clientRevision && result.payloadHash === item.payloadHash);
          if (matchingSubmissionReceipt(item, receipt)) await store.accept(item, receipt);
          else if (receipt?.accepted === false) await store.fail(item, {
            retryable: receipt.retryable === true, message: receipt.errorMessage || 'API не принял документ', code: receipt.errorCode,
          });
          else await store.fail(item, { retryable: true, message: 'Квитанция не подтверждена. Тот же пакет будет проверен повторно.' });
        }
      } catch (error) {
        for (const item of modern) await store.fail(item, uploadFailure(error));
      }
    }
  }
  if (!isCurrent() || Date.now() >= deadline) return;
  const waiting = await store.accepted(userId);
  if (!waiting.length) return;
  const results = await transport.statuses(waiting.map(item => item.receipt!.submissionId));
  for (const item of waiting) {
    if (!isCurrent()) return;
    const receipt = results.find(result => matchingSubmissionReceipt(item, result)
      && result.submissionId === item.receipt?.submissionId);
    if (!receipt) continue;
    if (receipt.state === 'QUEUED') {
      try { await store.complete({ ...item, receipt }, await transport.order(receipt), item.clientOrderId.startsWith('legacy-server:')); }
      catch { /* Keep the receipt AND the payload until exact durable reconciliation. */ }
    } else await store.status(item, receipt);
  }
}
