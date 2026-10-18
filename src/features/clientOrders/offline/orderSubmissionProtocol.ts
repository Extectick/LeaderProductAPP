import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export const RECEIPT_VERSION = 'client-order-inbox-v1';
export function canonicalSubmissionJson(value: unknown): string {
  const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(key => [key, stable(v[key])])) : v;
  return JSON.stringify(stable(JSON.parse(JSON.stringify(value))));
}
export function submissionHash(payload: unknown) { return bytesToHex(sha256(utf8ToBytes(canonicalSubmissionJson(payload)))); }
export type FrozenSubmission = {
  userId: string; clientOrderId: string; clientRevision: number; payloadHash: string; payload: any;
};
export type SubmissionReceipt = {
  receiptVersion: string; accepted: boolean; submissionId: string; userId: number;
  clientOrderId: string; clientRevision: number; intent: string; payloadHash: string;
  acceptedAt: string; state: string; orderGuid?: string | null;
  errorCode?: string | null; errorMessage?: string | null; errorDetails?: any;
};
export function matchingSubmissionReceipt(packet: FrozenSubmission, receipt: any): receipt is SubmissionReceipt {
  return receipt?.receiptVersion === RECEIPT_VERSION && receipt.accepted === true && receipt.intent === 'SUBMIT'
    && String(receipt.userId) === packet.userId && receipt.clientOrderId === packet.clientOrderId
    && receipt.clientRevision === packet.clientRevision && receipt.payloadHash === packet.payloadHash
    && typeof receipt.submissionId === 'string' && receipt.submissionId.length >= 8
    && typeof receipt.acceptedAt === 'string' && Number.isFinite(Date.parse(receipt.acceptedAt))
    && ['ACCEPTED', 'PROCESSING', 'RETRY', 'QUEUED', 'NEEDS_REVIEW', 'REJECTED'].includes(receipt.state);
}

export function submittedOrderConfirmsPacket(packet: FrozenSubmission, receipt: SubmissionReceipt | null,
  order: { guid: string; acceptedSubmission?: SubmissionReceipt }) {
  const proof = order.acceptedSubmission;
  return !!receipt && receipt.state === 'QUEUED' && matchingSubmissionReceipt(packet, receipt)
    && matchingSubmissionReceipt(packet, proof) && proof.state === 'QUEUED'
    && receipt.submissionId === proof.submissionId && receipt.orderGuid === order.guid && proof.orderGuid === order.guid;
}
export function isAutomaticSubmission(entry: { intent: string; status: string; clientOrderId: string }) {
  return entry.intent === 'SUBMIT' && ['READY_TO_SEND', 'SEND_ERROR', 'SENDING'].includes(entry.status)
    && !entry.clientOrderId.startsWith('legacy:');
}
