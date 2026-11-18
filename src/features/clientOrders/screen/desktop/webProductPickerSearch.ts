import type {ClientOrderProduct, PagedResult, searchClientOrderProducts} from '@/utils/clientOrdersService';

/** The active desktop picker owns cancellation; refresh updates exactly the page it requested. */
export async function loadWebProductPickerPage(params: Parameters<typeof searchClientOrderProducts>[0], options: {
  searchProducts: typeof searchClientOrderProducts;
  signal: AbortSignal;
  isCurrent: () => boolean;
  onRefresh: (fresh: PagedResult<ClientOrderProduct>, previousPage: Set<string>) => void;
}) {
  let previousPage = new Set<string>();
  const result = await options.searchProducts(params, {signal: options.signal, onRefresh: fresh => {
    if (options.signal.aborted || !options.isCurrent()) return;
    options.onRefresh(fresh, previousPage);
    previousPage = new Set(fresh.items.map(item => item.guid));
  }});
  previousPage = new Set(result.items.map(item => item.guid));
  return result;
}

export function productPickerPageProgress(result: PagedResult<ClientOrderProduct>, offset: number, limit: number) {
  const nextOffset = Number.isFinite(result.meta.nextOffset) && result.meta.nextOffset! > offset
    ? result.meta.nextOffset! : offset + result.items.length;
  return {nextOffset, hasMore: typeof result.meta.hasMore === 'boolean' ? result.meta.hasMore
    : typeof result.meta.total === 'number' ? nextOffset < result.meta.total : result.items.length >= limit};
}
