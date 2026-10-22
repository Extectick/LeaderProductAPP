import React from 'react';
import { StockRequestError, stockRequest, mergeStockPage, type StockPage, type StockQuery } from './products';

// Online only. Each route/filter/account owns its generation; late replies never cross scopes.
export function useStockProducts<T extends { guid?: string; id?: string }>(path: string | null, query: StockQuery, userId: string | undefined, online: boolean) {
  const queryKey = JSON.stringify(query);
  const identity = JSON.stringify([path, queryKey, userId]);
  const [pageIdentity, setPageIdentity] = React.useState(identity);
  const [page, setPage] = React.useState<StockPage<T> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const generation = React.useRef(0);
  const request = React.useRef<AbortController | null>(null);
  const pageRef = React.useRef<StockPage<T> | null>(null);
  const failed = React.useRef(false);
  const load = React.useCallback(async (append = false, explicitRetry = false) => {
    if (!path || !userId || (!online && !explicitRetry) || (append && (failed.current || request.current || !pageRef.current?.hasMore))) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const epoch = ++generation.current;
    const offset = append ? pageRef.current!.nextOffset : 0;
    setBusy(true); setLoadingMore(append); setError(null); failed.current = false;
    try {
      const result = await stockRequest<StockPage<T>>(path, { ...JSON.parse(queryKey), offset,
        ...(append && pageRef.current?.nextCursor ? { cursor: pageRef.current.nextCursor } : {}) }, controller.signal);
      if (epoch !== generation.current) return;
      const next = { ...result, items: append ? mergeStockPage(pageRef.current?.items ?? [], result.items) : result.items };
      pageRef.current = next; setPageIdentity(identity); setPage(next);
    } catch (e) {
      if (epoch !== generation.current || controller.signal.aborted) return;
      failed.current = true;
      if (!append || (e instanceof StockRequestError && [401, 403].includes(e.status))) { pageRef.current = null; setPage(null); }
      setError(e instanceof StockRequestError ? e.message : 'Не удалось обновить остатки');
    } finally {
      if (epoch === generation.current) { request.current = null; setBusy(false); setLoadingMore(false); }
    }
  }, [path, queryKey, userId, online, identity]);
  React.useEffect(() => {
    generation.current++; request.current?.abort(); request.current = null;
    pageRef.current = null; setPage(null); setError(null); setBusy(false); setLoadingMore(false);
  }, [path, queryKey, userId, online]);
  React.useEffect(() => {
    void load();
    return () => { generation.current++; request.current?.abort(); request.current = null; };
  }, [load]);
  return { page: online && pageIdentity === identity ? page : null, busy, loadingMore,
    refreshing: online && busy && !!page && pageIdentity === identity && !loadingMore,
    error, refresh: () => load(false, true), loadMore: () => load(true) };
}
