import type { DraftItem, DraftOrder } from '../clientOrdersShared';

export type PendingLineInputReader = (draft: DraftOrder) => DraftOrder;

/** Apply only the sheet edits the workspace has not received yet. */
export function withPendingLineInput(
  draft: DraftOrder, source: DraftOrder, item: DraftItem,
  patch: Partial<DraftItem>, allowAppend: boolean,
): DraftOrder {
  if (draft.guid !== source.guid || draft.clientOrderId !== source.clientOrderId
      || draft.organizationGuid !== source.organizationGuid || draft.counterpartyGuid !== source.counterpartyGuid) return draft;
  const index = draft.items.findIndex(line => line.key === item.key);
  if (index < 0) {
    if (!allowAppend || draft.items.some(line => line.productGuid === item.productGuid)) return draft;
    const added = {...item, ...patch};
    const quantity = Number(String(added.quantity).replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0) return draft;
    return {...draft, items: [...draft.items, added]};
  }
  const current = draft.items[index];
  if (current.lineGuid !== item.lineGuid || current.productGuid !== item.productGuid || current.isCancelled) return draft;
  if (!(Object.keys(patch) as (keyof DraftItem)[]).some(key => current[key] !== patch[key])) return draft;
  const items = draft.items.slice();
  items[index] = {...current, ...patch};
  return {...draft, items};
}
