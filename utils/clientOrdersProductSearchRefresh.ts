import type { ClientOrderProduct, PagedResult } from './clientOrdersService';
import { refreshUnresolvedSnapshot } from './refreshUnresolvedSnapshot';

function needsRefresh(item: ClientOrderProduct) {
  return Boolean(item.freshness?.commercialPending || item.freshness?.receiptPricePending
    || (item.freshness?.source === 'local-read-model' && item.freshness.commercialCheckedAt == null
      && item.freshness.priceStatus === 'unknown'));
}

/** Only updates search presentation; never mutates a draft. */
export function refreshPendingProductSearch(
  initial: PagedResult<ClientOrderProduct>,
  load: () => Promise<PagedResult<ClientOrderProduct>>,
  onRefresh: (result: PagedResult<ClientOrderProduct>) => void,
  signal: AbortSignal,
) {
  return refreshUnresolvedSnapshot(initial,
    result => result.items.some(needsRefresh),
    async () => {
      try { return await load(); }
      catch (error) {
        const status = (error as {status?: number} | null)?.status;
        if (status === 401 || status === 403) {
          return {items: [], meta: {accessDenied: true, accessStatus: status, hasMore: false}};
        }
        throw error;
      }
    }, onRefresh, signal, {onExhausted: result => onRefresh({...result,
      items: result.items.map(item => item.freshness && needsRefresh(item) ? {...item,
        freshness: {...item.freshness, refreshPaused: true}} : item)})});
}
