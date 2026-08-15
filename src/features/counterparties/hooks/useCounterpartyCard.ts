import React from 'react';
import { getCounterpartyCard } from '../api/counterpartyCardService';
import type { CounterpartyCardBootstrap } from '../model/counterpartyCard.types';

const snapshots = new Map<string, CounterpartyCardBootstrap>();
const latestSnapshots = new Map<string, CounterpartyCardBootstrap>();
const snapshotUpdatedAt = new Map<string, number>();
const SNAPSHOT_FRESH_MS = 60_000;

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
    () => snapshots.get(key) || latestSnapshots.get(identityKey) || null
  );
  const [loading, setLoading] = React.useState(() => !snapshots.has(key));
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  const load = React.useCallback(async (force = false) => {
    if (!counterpartyGuid) return;
    const requestId = ++requestIdRef.current;
    const hasSnapshot = Boolean(snapshots.get(key));
    const snapshotAge = Date.now() - (snapshotUpdatedAt.get(key) || 0);
    if (!force && hasSnapshot && snapshotAge < SNAPSHOT_FRESH_MS) {
      setData(snapshots.get(key) || null);
      setLoading(false);
      setRefreshing(false);
      setError(null);
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
      });
      if (requestId !== requestIdRef.current) return;
      snapshots.set(key, next);
      snapshotUpdatedAt.set(key, Date.now());
      latestSnapshots.set(identityKey, next);
      setData(next);
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить карточку контрагента.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [counterpartyGuid, customFrom, customTo, identityKey, key, organizationGuid, period]);

  React.useEffect(() => {
    requestIdRef.current += 1;
    const snapshot = snapshots.get(key) || null;
    const stableSnapshot = snapshot || latestSnapshots.get(identityKey) || null;
    setData(stableSnapshot);
    setLoading(!snapshot);
    setRefreshing(Boolean(snapshot));
    setError(null);
    void load(false);
    return () => { requestIdRef.current += 1; };
  }, [identityKey, key, load]);

  return { data, loading, refreshing, error, retry: () => load(false), refresh: () => load(true) };
}
