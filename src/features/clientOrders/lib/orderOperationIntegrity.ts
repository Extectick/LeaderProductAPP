/** Never consume a newer local operation when an older request completes. */
export function isSameOrderOperation(
  current: { id: string; clientRevision: number; intent?: string }, sent: { id: string; clientRevision: number; intent?: string }
) { return current.id === sent.id && current.clientRevision === sent.clientRevision && current.intent === sent.intent; }

export function orderChangeReview(error: unknown) {
  const details = (error as any)?.errorDetails;
  if (details?.kind !== 'ORDER_CHANGE_REVIEW_REQUIRED'
    || typeof details.confirmationToken !== 'string' || typeof details.baseContentToken !== 'string'
    || !Array.isArray(details.changes)) return null;
  return details as { baseContentToken: string; confirmationToken: string;
    changes: Array<{ productName: string; reason: string; before: number; after: number | null }> };
}
