import type { ClientOrderProduct, PagedResult } from './clientOrdersService';
import { refreshPendingSnapshot } from './refreshPendingSnapshot';

/** Only updates search presentation; never mutates a draft. */
export function refreshPendingProductSearch(
  initial: PagedResult<ClientOrderProduct>,
  load: () => Promise<PagedResult<ClientOrderProduct>>,
  onRefresh: (result: PagedResult<ClientOrderProduct>) => void,
  signal: AbortSignal,
) {
  return refreshPendingSnapshot(initial,
    result => result.items.some(item => item.freshness?.commercialPending || item.freshness?.receiptPricePending),
    result => ({...result, items: result.items.map(item => item.freshness ? {...item,
      freshness: {...item.freshness, commercialPending: false, receiptPricePending: false}} : item)}),
    async () => {
      try { return await load(); }
      catch (error) {
        if ([401, 403].includes(Number((error as {status?: number})?.status))) {
          return {items: [], meta: {accessDenied: true, hasMore: false}};
        }
        throw error;
      }
    }, onRefresh, signal);
}
