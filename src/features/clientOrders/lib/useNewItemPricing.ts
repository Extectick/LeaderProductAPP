import React from 'react';
import { getClientOrderProductsBatch } from '@/utils/clientOrdersService';
import { hasManualPrice, type DraftItem, type DraftOrder } from '../clientOrdersShared';

function scopeOf(userId: string | null, draft: DraftOrder) {
  return JSON.stringify([userId, draft.clientOrderId, draft.guid, draft.organizationGuid,
    draft.counterpartyGuid, draft.agreementGuid, draft.contractGuid, draft.warehouseGuid, draft.priceTypeGuid]);
}
type Target = { item: DraftItem; generation: number };
function stillUnknown(current: DraftItem, original: DraftItem) {
  return current.key === original.key && current.lineGuid === original.lineGuid
    && current.productGuid === original.productGuid && !current.isCancelled
    && !hasManualPrice(current) && current.basePrice == null
    && current.priceTypeGuid === original.priceTypeGuid;
}

/** One debounced live batch for newly added unknown prices; no retry or offline-price promotion. */
export function useNewItemPricing(draft: DraftOrder, userId: string | null,
  patchDraft: (patch: (previous: DraftOrder) => DraftOrder) => void) {
  const latest = React.useRef({ draft, userId, patchDraft });
  latest.current = { draft, userId, patchDraft };
  const state = React.useRef({ scope: scopeOf(userId, draft), generation: 0, alive: true,
    queue: new Map<string, Target>(), active: new Map<string, Target>(),
    timer: null as ReturnType<typeof setTimeout> | null, running: false });
  const current = state.current;
  const scope = scopeOf(userId, draft);
  if (current.scope !== scope) {
    current.scope = scope;
    current.generation += 1;
    current.queue.clear();
    current.active.clear();
  }
  // Removal/cancellation/manual edits permanently invalidate an in-flight target,
  // even if the user later restores that line before the response arrives.
  for (const [key, target] of current.active) {
    if (!draft.items.some(item => stillUnknown(item, target.item))) current.active.delete(key);
  }

  React.useEffect(() => {
    current.alive = true;
    return () => {
      current.alive = false;
      current.generation += 1;
      current.queue.clear();
      current.active.clear();
      if (current.timer) clearTimeout(current.timer);
    };
  }, [current]);

  return React.useCallback((item: DraftItem) => {
    const value = latest.current;
    if (!value.userId || !value.draft.organizationGuid || !value.draft.counterpartyGuid
      || item.basePrice != null || hasManualPrice(item) || item.isCancelled) return;
    current.queue.set(item.key, { item, generation: current.generation });
    if (current.timer || current.running) return;
    const drain = async () => {
      current.timer = null;
      current.running = true;
      try {
        while (current.alive && current.queue.size) {
          const snapshot = latest.current;
          const generation = current.generation;
          const first = current.queue.values().next().value!;
          const priceTypeGuid = first.item.priceTypeGuid || snapshot.draft.priceTypeGuid || undefined;
          const targets: Target[] = [];
          for (const [key, target] of current.queue) {
            if ((target.item.priceTypeGuid || snapshot.draft.priceTypeGuid || undefined) !== priceTypeGuid) continue;
            current.queue.delete(key);
            if (target.generation === generation && snapshot.draft.items.some(line => stillUnknown(line, target.item))) {
              targets.push(target);
              current.active.set(key, target);
            }
            if (targets.length === 50) break;
          }
          if (!targets.length) continue;
          try {
            const products = await getClientOrderProductsBatch({
              productGuids: [...new Set(targets.map(target => target.item.productGuid))],
              organizationGuid: snapshot.draft.organizationGuid,
              counterpartyGuid: snapshot.draft.counterpartyGuid,
              agreementGuid: snapshot.draft.agreementGuid || undefined,
              warehouseGuid: snapshot.draft.warehouseGuid || undefined,
              priceTypeGuid,
            }, { onlineOnly: true });
            if (!current.alive || current.generation !== generation) continue;
            const byGuid = new Map(products.map(product => [product.guid, product]));
            const accepted = new Map(targets.filter(target => current.active.get(target.item.key) === target)
              .map(target => [target.item.key, target.item]));
            if (!latest.current.draft.items.some(line => {
              const original = accepted.get(line.key);
              return original && stillUnknown(line, original) && byGuid.get(line.productGuid)?.basePrice != null;
            })) continue;
            latest.current.patchDraft(previous => {
              if (!current.alive || current.generation !== generation || scopeOf(snapshot.userId, previous) !== current.scope) return previous;
              return { ...previous, items: previous.items.map(line => {
                const original = accepted.get(line.key), product = byGuid.get(line.productGuid);
                if (!original || !stillUnknown(line, original) || product?.basePrice == null
                  || !Number.isFinite(product.basePrice) || product.freshness?.priceStatus === 'unknown') return line;
                return { ...line, basePrice: product.basePrice,
                  priceTypeGuid: line.priceTypeGuid ?? product.priceType?.guid ?? priceTypeGuid ?? null,
                  priceTypeName: line.priceTypeName ?? product.priceType?.name ?? null,
                  receiptPrice: line.receiptPrice ?? product.receiptPrice ?? null,
                  productWeight: line.productWeight ?? product.weight ?? null,
                  weightUnit: line.weightUnit ?? product.weightUnit ?? null,
                  stock: line.stock ?? product.stock ?? null };
              }) };
            });
          } catch {
            // Keep unknown on failure. Ordinary explicit pricing refresh remains available.
          } finally {
            for (const target of targets) {
              if (current.active.get(target.item.key) === target) current.active.delete(target.item.key);
            }
          }
        }
      } finally { current.running = false; }
    };
    current.timer = setTimeout(() => { void drain(); }, 200);
  }, [current]);
}
