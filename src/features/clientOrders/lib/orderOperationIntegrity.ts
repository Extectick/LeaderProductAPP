/** Never consume a newer local operation when an older request completes. */
export function isSameOrderOperation(
  current: { id: string; clientRevision: number; intent?: string }, sent: { id: string; clientRevision: number; intent?: string }
) { return current.id === sent.id && current.clientRevision === sent.clientRevision && current.intent === sent.intent; }

/** Finding an older SAVE is not evidence that a timed-out SUBMIT was accepted. */
export function isReconciledOrderOperation(
  order: { clientOrderId?: string | null; clientRevision?: number | null; syncState?: string },
  sent: { clientOrderId: string; clientRevision: number; intent?: string }
) {
  return order.clientOrderId === sent.clientOrderId && order.clientRevision === sent.clientRevision
    && (sent.intent !== 'SUBMIT' || order.syncState === 'QUEUED' || order.syncState === 'SYNCED');
}

export function orderChangeReview(error: unknown) {
  const details = (error as any)?.errorDetails;
  if (details?.kind !== 'ORDER_CHANGE_REVIEW_REQUIRED'
    || typeof details.confirmationToken !== 'string' || typeof details.baseContentToken !== 'string'
    || !Array.isArray(details.changes)) return null;
  return details as { baseContentToken: string; confirmationToken: string;
    changes: Array<{ productName: string; reason: string; before: number; after: number | null }> };
}
