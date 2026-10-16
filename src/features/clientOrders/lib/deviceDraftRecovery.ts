import type { ClientOrder } from '@/utils/clientOrdersService';
import { buildCopyPayload, orderToDraft } from '../clientOrdersShared';

type Payload = ReturnType<typeof buildCopyPayload>;
export type RecoverableDeviceDraft = {
  clientOrderId: string;
  clientRevision: number;
  intent: 'SAVE' | 'SUBMIT';
  payload: Payload;
};

const text = (value: unknown) => String(value ?? '').trim();
const guid = (value: unknown) => text(value).toLowerCase();
const number = (value: unknown) => value == null || value === '' ? null : Number(value);

// Compare user input, not calculated totals, timestamps, tokens or server defaults.
// A matching client id alone is NOT permission to discard a local edit.
export function sameDeviceDraftContent(left: Payload, right: Payload) {
  const refs = ['organizationGuid', 'counterpartyGuid', 'agreementGuid', 'contractGuid',
    'warehouseGuid', 'deliveryAddressGuid', 'priceTypeGuid'] as const;
  if (refs.some(key => guid(left[key]) !== guid(right[key]))) return false;
  const strings = ['paymentForm', 'deliveryMethod', 'comment', 'currency'] as const;
  if (strings.some(key => text(left[key]) !== text(right[key]))) return false;
  const date = (value: unknown) => {
    const parsed = Date.parse(text(value));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text(value);
  };
  if (date(left.deliveryDate) !== date(right.deliveryDate)
    || Boolean(left.invoiceRequested) !== Boolean(right.invoiceRequested)
    || (number(left.generalDiscountPercent) ?? 0) !== (number(right.generalDiscountPercent) ?? 0)) return false;
  if (!left.items.length || left.items.length !== right.items.length) return false;
  const sorted = (items: Payload['items']) => [...items].sort((a, b) => guid(a.lineGuid).localeCompare(guid(b.lineGuid)));
  const otherItems = sorted(right.items);
  return sorted(left.items).every((item, index) => {
    const other = otherItems[index];
    return Boolean(item.lineGuid) && guid(item.lineGuid) === guid(other.lineGuid)
      && guid(item.productGuid) === guid(other.productGuid)
      && guid(item.packageGuid) === guid(other.packageGuid)
      && number(item.quantity) === number(other.quantity)
      && number(item.manualPrice) === number(other.manualPrice)
      && (!item.priceTypeGuid || guid(item.priceTypeGuid) === guid(other.priceTypeGuid))
      && (number(item.discountPercent) ?? 0) === (number(other.discountPercent) ?? 0)
      && text(item.comment) === text(other.comment)
      && Boolean(item.isCancelled) === Boolean(other.isCancelled)
      && guid(item.cancelReasonGuid) === guid(other.cancelReasonGuid)
      && text(item.cancelReason) === text(other.cancelReason)
      && text(item.cancelReasonName) === text(other.cancelReasonName)
      && number(item.cancelledAmount) === number(other.cancelledAmount);
  });
}

export function savedOrderConfirmsDeviceDraft(entry: RecoverableDeviceDraft, order: ClientOrder, userId: number) {
  if (acceptedSubmissionConfirmsDeviceDraft(entry, order, userId)) return true;
  if (!entry.clientOrderId || entry.clientOrderId.startsWith('legacy:') || entry.clientOrderId.startsWith('legacy-server:')
    || order.origin === 'device' || !order.guid || order.clientOrderId !== entry.clientOrderId
    || order.createdByUser?.id !== userId || !Number.isInteger(order.clientRevision)
    || Number(order.clientRevision) < entry.clientRevision) return false;
  if (entry.intent === 'SUBMIT' && !['QUEUED', 'SENT_TO_1C', 'CONFIRMED'].includes(order.status)) return false;
  try {
    return sameDeviceDraftContent(entry.payload, buildCopyPayload(orderToDraft(order)));
  } catch {
    return false;
  }
}

/** A higher local counter can be a failed autosave of an already accepted input.
 * Retire it only against hash-verified historical input, not normalized 1C fields. */
export function acceptedSubmissionConfirmsDeviceDraft(entry: RecoverableDeviceDraft, order: ClientOrder, userId: number) {
  const proof = order.acceptedClientOperation;
  if (entry.intent !== 'SUBMIT' || !proof || proof.intent !== 'SUBMIT'
    || entry.clientOrderId.startsWith('legacy') || order.clientOrderId !== entry.clientOrderId
    || order.origin === 'device' || !order.guid || order.createdByUser?.id !== userId
    || order.syncState !== 'SYNCED' || order.status !== 'CONFIRMED' || !order.isPostedIn1c || !order.number1c
    || order.lastExportError || order.last1cError
    || !Number.isInteger(proof.clientRevision) || proof.clientRevision !== order.clientRevision
    || !Number.isInteger(entry.clientRevision) || entry.clientRevision <= proof.clientRevision) return false;
  try { return sameDeviceDraftContent(entry.payload, proof.payload as Payload); } catch { return false; }
}
