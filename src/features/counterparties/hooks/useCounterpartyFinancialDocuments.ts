import React from 'react';
import { getCounterpartyFinancialDocuments } from '../api/counterpartyCardService';
import type {
  CounterpartyFinancialDocument,
  CounterpartyFinancialDocumentsPage,
  CounterpartyFinancialDocumentsParams,
} from '../model/counterpartyCard.types';

const PAGE_SIZE = 20;

function mergeUnique(previous: CounterpartyFinancialDocument[], next: CounterpartyFinancialDocument[]) {
  const documentKey = (item: CounterpartyFinancialDocument) => item.documentGuid
    || `${item.documentTypeCode || ''}:${item.number || ''}:${item.date || ''}:${item.organizationGuid || ''}`;
  const byGuid = new Map(previous.map((item) => [documentKey(item), item]));
  next.forEach((item) => byGuid.set(documentKey(item), item));
  return Array.from(byGuid.values());
}

export function useCounterpartyFinancialDocuments(
  params: Omit<CounterpartyFinancialDocumentsParams, 'cursor' | 'limit'>,
  enabled: boolean
) {
  const [pageState, setPageState] = React.useState<{ key: string; value: CounterpartyFinancialDocumentsPage } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const requestIdRef = React.useRef(0);
  const { counterpartyGuid, organizationGuid, preset, periodFrom, periodTo, status } = params;
  const key = `${counterpartyGuid}:${organizationGuid}:${preset}:${periodFrom || ''}:${periodTo || ''}:${status || 'ALL'}`;
  const page = pageState?.key === key ? pageState.value : null;

  const load = React.useCallback(async (cursor: string | null, append: boolean) => {
    if (!enabled || !counterpartyGuid || !organizationGuid) return;
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    abortRef.current = controller;
    setError(null);
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const next = await getCounterpartyFinancialDocuments({
        counterpartyGuid,
        organizationGuid,
        preset,
        periodFrom,
        periodTo,
        status,
        cursor,
        limit: PAGE_SIZE,
      }, controller?.signal);
      if (requestId !== requestIdRef.current) return;
      setPageState((previous) => append && previous?.key === key
        ? { key, value: { ...next, items: mergeUnique(previous.value.items, next.items) } }
        : { key, value: next });
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить финансовые документы.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [counterpartyGuid, enabled, key, organizationGuid, periodFrom, periodTo, preset, status]);

  React.useEffect(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setPageState(null);
    setError(null);
    if (enabled) void load(null, false);
    return () => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, key, load]);

  const loadMore = React.useCallback(() => {
    if (!page?.hasMore || !page.nextCursor || loading || loadingMore) return;
    void load(page.nextCursor, true);
  }, [load, loading, loadingMore, page?.hasMore, page?.nextCursor]);

  return { page, loading, loadingMore, error, loadMore };
}
