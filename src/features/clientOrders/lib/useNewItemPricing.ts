import React from 'react';
import { getClientOrderProductsBatch } from '@/utils/clientOrdersService';
import { isNetworkUnavailableError } from '@/src/shared/errors/userErrorMessage';
import { hasManualPrice, type DraftItem, type DraftOrder } from '../clientOrdersShared';

function scopeOf(userId: string | null, draft: DraftOrder, recoverMissingPrices: boolean) {
  return JSON.stringify([userId, recoverMissingPrices, draft.clientOrderId || draft.guid, draft.organizationGuid,
    draft.counterpartyGuid, draft.agreementGuid, draft.contractGuid, draft.warehouseGuid, draft.priceTypeGuid]);
}
type Target = { item: DraftItem; generation: number };
function needsPrice(line: DraftItem) {
  return !line.isCancelled && !hasManualPrice(line) && (line.basePrice == null || line.basePrice <= 0);
}
function stillUnknown(current: DraftItem, original: DraftItem) {
  return current.key === original.key && current.lineGuid === original.lineGuid
    && current.productGuid === original.productGuid && needsPrice(current)
    && current.priceTypeGuid === original.priceTypeGuid;
}

/** Fill missing automatic prices using the current order terms and a bounded online batch. */
export function useNewItemPricing(draft: DraftOrder, userId: string | null,
  patchDraft: (patch: (previous: DraftOrder) => DraftOrder) => void, recoverMissingPrices = true) {
  const [pendingRevision, updatePending] = React.useReducer((revision: number) => revision + 1, 0);
  const latest = React.useRef({ draft, userId, patchDraft, recoverMissingPrices });
  latest.current = { draft, userId, patchDraft, recoverMissingPrices };
  const state = React.useRef({ scope: scopeOf(userId, draft, recoverMissingPrices), generation: 0, alive: true,
    attempted: new Map<string, DraftItem>(), queue: new Map<string, Target>(), active: new Map<string, Target>(),
    timer: null as ReturnType<typeof setTimeout> | null, running: false });
  const current = state.current;
  const scope = scopeOf(userId, draft, recoverMissingPrices);
  if (current.scope !== scope) {
    current.scope = scope;
    current.generation += 1;
    current.queue.clear();
    current.active.clear();
    current.attempted.clear();
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
      current.attempted.clear();
      if (current.timer) clearTimeout(current.timer);
      current.timer = null;
    };
  }, [current]);

  const enqueue = React.useCallback((item: DraftItem) => {
    const value = latest.current;
    if (!value.userId || !value.draft.organizationGuid || !value.draft.counterpartyGuid
      || !needsPrice(item) || !item.productGuid) return;
    const existing = current.queue.get(item.key) ?? current.active.get(item.key);
    if (existing && stillUnknown(item, existing.item)) return;
    current.attempted.set(item.key, item);
    current.queue.set(item.key, { item, generation: current.generation });
    updatePending();
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
            const load = () => getClientOrderProductsBatch({
              productGuids: [...new Set(targets.map(target => target.item.productGuid))],
              organizationGuid: snapshot.draft.organizationGuid,
              counterpartyGuid: snapshot.draft.counterpartyGuid,
              agreementGuid: snapshot.draft.agreementGuid || undefined,
              warehouseGuid: snapshot.draft.warehouseGuid || undefined,
              priceTypeGuid,
            }, { onlineOnly: true });
            let products;
            try {
              products = await load();
            } catch (error) {
              const status = (error as { status?: number } | null)?.status;
              if (!isNetworkUnavailableError(error) && ![408, 502, 503, 504].includes(status ?? -1)) throw error;
              await new Promise(resolve => setTimeout(resolve, 1000));
              if (!current.alive || current.generation !== generation
                || !targets.some(target => current.active.get(target.item.key) === target)) continue;
              products = await load();
            }
            if (!current.alive || current.generation !== generation) continue;
            const byGuid = new Map(products.filter(product => product.basePrice != null && Number.isFinite(product.basePrice)
              && product.basePrice > 0 && product.freshness?.priceStatus !== 'unknown').map(product => [product.guid, product]));
            const accepted = new Map(targets.filter(target => current.active.get(target.item.key) === target)
              .map(target => [target.item.key, target.item]));
            if (!latest.current.draft.items.some(line => {
              const original = accepted.get(line.key);
              return original && stillUnknown(line, original) && byGuid.has(line.productGuid);
            })) continue;
            latest.current.patchDraft(previous => {
              if (!current.alive || current.generation !== generation || scopeOf(snapshot.userId, previous, snapshot.recoverMissingPrices) !== current.scope) return previous;
              return { ...previous, items: previous.items.map(line => {
                const original = accepted.get(line.key), product = byGuid.get(line.productGuid);
                if (!original || !stillUnknown(line, original) || !product) return line;
                return { ...line, basePrice: product.basePrice,
                  priceSource: product.priceMatch?.source ? `${product.priceMatch.source}:${product.priceMatch.level ?? ''}` : line.priceSource,
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
            if (current.alive) updatePending();
          }
        }
      } finally { current.running = false; }
    };
    current.timer = setTimeout(() => { void drain(); }, 200);
  }, [current]);

  // Recover when an editor opens a draft or reconnects. Later changes to the header
  // and individual price types already have their own explicit repricing requests.
  const recoveredOrder = React.useRef<string | null>(null);
  const recoveryKey = userId && recoverMissingPrices && draft.organizationGuid && draft.counterpartyGuid
    ? JSON.stringify([userId, draft.clientOrderId || draft.guid]) : null;
  React.useEffect(() => {
    if (!recoveryKey) {
      recoveredOrder.current = null;
      return;
    }
    if (!draft.items.length || recoveredOrder.current === recoveryKey) return;
    recoveredOrder.current = recoveryKey;
    for (const item of draft.items) {
      const attempted = current.attempted.get(item.key);
      if (needsPrice(item) && (!attempted || !stillUnknown(item, attempted))) enqueue(item);
    }
  }, [recoveryKey, draft.items, current, enqueue]);

  const pendingItemPriceKeys = React.useMemo(() => new Set(draft.items.filter(line => {
    const target = current.queue.get(line.key) ?? current.active.get(line.key);
    return target && stillUnknown(line, target.item);
  }).map(line => line.key)), [draft.items, current, scope, pendingRevision]);

  return { enqueue, pendingItemPriceKeys };
}
