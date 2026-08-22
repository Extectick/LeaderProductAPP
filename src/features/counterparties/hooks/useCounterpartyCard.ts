import React from 'react';
import { getCounterpartyCard } from '../api/counterpartyCardService';
import type { CounterpartyCardBootstrap } from '../model/counterpartyCard.types';

const snapshots = new Map<string, CounterpartyCardBootstrap>();
const latestSnapshots = new Map<string, CounterpartyCardBootstrap>();
const snapshotUpdatedAt = new Map<string, number>();
const SNAPSHOT_FRESH_MS = 60_000;
const MAX_PERIOD_SNAPSHOTS = 48;
const MAX_COUNTERPARTY_SNAPSHOTS = 24;
const PERIOD_REQUEST_DEBOUNCE_MS = 180;

function readSnapshot(key: string) {
  const snapshot = snapshots.get(key) || null;
  if (snapshot) {
    snapshots.delete(key);
    snapshots.set(key, snapshot);
  }
  return snapshot;
}

function readLatestSnapshot(key: string) {
  const snapshot = latestSnapshots.get(key) || null;
  if (snapshot) {
    latestSnapshots.delete(key);
    latestSnapshots.set(key, snapshot);
  }
  return snapshot;
}

function storeSnapshot(key: string, value: CounterpartyCardBootstrap) {
  snapshots.delete(key);
  snapshots.set(key, value);
  snapshotUpdatedAt.set(key, Date.now());
  while (snapshots.size > MAX_PERIOD_SNAPSHOTS) {
    const oldestKey = snapshots.keys().next().value as string | undefined;
    if (!oldestKey) break;
    snapshots.delete(oldestKey);
    snapshotUpdatedAt.delete(oldestKey);
  }
}

function storeLatestSnapshot(key: string, value: CounterpartyCardBootstrap) {
  latestSnapshots.delete(key);
  latestSnapshots.set(key, value);
  while (latestSnapshots.size > MAX_COUNTERPARTY_SNAPSHOTS) {
    const oldestKey = latestSnapshots.keys().next().value as string | undefined;
    if (!oldestKey) break;
    latestSnapshots.delete(oldestKey);
  }
}

function cacheKey(counterpartyGuid: string, organizationGuid?: string | null) {
  return `${counterpartyGuid.toLowerCase()}:${String(organizationGuid || 'all').toLowerCase()}`;
}

export function useCounterpartyCard(
  counterpartyGuid: string,
  organizationGuid?: string | null,
  period: import('../model/counterpartyCard.types').CounterpartySalesPeriod = 'month',
  customRange?: { from: string; to: string } | null
) {
  const customFrom = period === 'custom' ? customRange?.from || '' : '';
  const customTo = period === 'custom' ? customRange?.to || '' : '';
  const identityKey = React.useMemo(
    () => cacheKey(counterpartyGuid, organizationGuid),
    [counterpartyGuid, organizationGuid]
  );
  const key = React.useMemo(
    () => `${identityKey}:${period}:${customFrom}:${customTo}`,
    [customFrom, customTo, identityKey, period]
  );
  const [data, setData] = React.useState<CounterpartyCardBootstrap | null>(
    () => readSnapshot(key) || readLatestSnapshot(identityKey) || null
  );
  const [loading, setLoading] = React.useState(() => !snapshots.has(key));
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);

  const load = React.useCallback(async (force = false) => {
    if (!counterpartyGuid) return;
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    abortRef.current = controller;
    const cachedSnapshot = readSnapshot(key);
    const hasSnapshot = Boolean(cachedSnapshot);
    const snapshotAge = Date.now() - (snapshotUpdatedAt.get(key) || 0);
    if (!force && hasSnapshot && snapshotAge < SNAPSHOT_FRESH_MS) {
      setData(cachedSnapshot);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      if (abortRef.current === controller) abortRef.current = null;
      return;
    }
    setError(null);
    if (force || hasSnapshot) setRefreshing(true);
    else setLoading(true);
    try {
      if (period === 'custom' && (!customFrom || !customTo)) return;
      const next = await getCounterpartyCard({
        counterpartyGuid,
        organizationGuid,
        preset: period,
        periodFrom: customFrom || null,
        periodTo: customTo || null,
        refresh: force,
      }, controller?.signal);
      if (requestId !== requestIdRef.current) return;
      storeSnapshot(key, next);
      storeLatestSnapshot(identityKey, next);
      setData(next);
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить карточку контрагента.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [counterpartyGuid, customFrom, customTo, identityKey, key, organizationGuid, period]);

  React.useEffect(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const snapshot = readSnapshot(key);
    const stableSnapshot = snapshot || readLatestSnapshot(identityKey);
    setData(stableSnapshot);
    setLoading(!snapshot);
    setRefreshing(Boolean(snapshot));
    setError(null);
    const timer = setTimeout(() => { void load(false); }, snapshot ? 0 : PERIOD_REQUEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [identityKey, key, load]);

  return { data, loading, refreshing, error, retry: () => load(false), refresh: () => load(true) };
}
