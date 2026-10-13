import React from 'react';
import { StockRequestError, stockRequest, mergeStockPage, type StockPage, type StockQuery } from './products';
import { clearStockCache, readStockCache, writeStockCache } from './stockCache';

// Each route/filter/account owns its generation. Late responses may never mutate another one.
export function useStockProducts<T extends { guid?: string; id?: string }>(path: string | null, query: StockQuery, userId: string | undefined, online: boolean) {
  const queryKey = JSON.stringify(query);
  const identity = JSON.stringify([path, queryKey, userId]);
  const [pageIdentity, setPageIdentity] = React.useState(identity);
  const [page, setPage] = React.useState<StockPage<T> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const generation = React.useRef(0);
  const request = React.useRef<AbortController | null>(null);
  const pageRef = React.useRef<StockPage<T> | null>(null);
  const failed = React.useRef(false);
  const load = React.useCallback(async (append = false) => {
    if (!path || !userId || (append && (!online || failed.current || request.current || !pageRef.current?.hasMore))) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const epoch = ++generation.current;
    const cacheKey = `${path}:${queryKey}`;
    const offset = append ? pageRef.current!.nextOffset : 0;
    setBusy(online); setError(null); failed.current = false;
    try {
      if (!pageRef.current) {
        const cached = await readStockCache<T>(userId, cacheKey);
        if (epoch !== generation.current) return;
        if (cached) { pageRef.current = cached; setPageIdentity(identity); setPage(cached); setStale(true); }
      }
      if (!online) return;
      const result = await stockRequest<StockPage<T>>(path, { ...JSON.parse(queryKey), offset }, controller.signal);
      if (epoch !== generation.current) return;
      const next = { ...result, items: append ? mergeStockPage(pageRef.current?.items ?? [], result.items) : result.items };
      pageRef.current = next; setPageIdentity(identity); setPage(next); setStale(false);
      void writeStockCache(userId, cacheKey, next);
    } catch (e) {
      if (epoch !== generation.current || controller.signal.aborted) return;
      failed.current = true;
      if (e instanceof StockRequestError && [401, 403].includes(e.status)) { pageRef.current = null; setPage(null); void clearStockCache(userId); }
      setStale(true); setError(e instanceof StockRequestError ? e.message : 'Не удалось обновить остатки');
    } finally {
      if (epoch === generation.current) { request.current = null; setBusy(false); }
    }
  }, [path, queryKey, userId, online, identity]);
  React.useEffect(() => {
    generation.current++; request.current?.abort(); request.current = null;
    pageRef.current = null; setPage(null); setError(null); setBusy(false); setStale(false);
  }, [path, queryKey, userId]);
  React.useEffect(() => {
    void load();
    return () => { generation.current++; request.current?.abort(); request.current = null; setBusy(false); };
  }, [load]);
  return { page: pageIdentity === identity ? page : null, busy, error, stale: stale || !online, refresh: () => load(false), loadMore: () => load(true) };
}
