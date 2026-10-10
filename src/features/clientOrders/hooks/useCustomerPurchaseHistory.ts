import * as React from 'react';
import { apiClient } from '../../../../utils/apiClient';
import { readCustomerPurchaseHistory, writeCustomerPurchaseHistory } from '../offline/customerPurchaseHistoryDatabase';
import { isPurchaseHistory, type CustomerPurchaseHistory } from '../lib/customerPurchaseHistory';

export function useCustomerPurchaseHistory(input: {
  userId: string; organizationGuid?: string | null; counterpartyGuid?: string | null; enabled: boolean; online: boolean;
}) {
  const { userId, enabled, online } = input;
  const organizationGuid = input.organizationGuid?.toLowerCase() || '';
  const counterpartyGuid = input.counterpartyGuid?.toLowerCase() || '';
  const key = `${userId}:${organizationGuid}:${counterpartyGuid}`;
  const [state, setState] = React.useState<{ key: string; snapshot: CustomerPurchaseHistory | null; loading: boolean; error: boolean }>({ key: '', snapshot: null, loading: false, error: false });
  const [retry, setRetry] = React.useState(0);
  const handledRetry = React.useRef(0);
  const latest = React.useRef(state);
  latest.current = state;
  React.useEffect(() => {
    if (!enabled || !organizationGuid || !counterpartyGuid || userId === 'anonymous') return;
    const force = handledRetry.current !== retry;
    handledRetry.current = retry;
    let cancelled = false;
    const publish = (snapshot: CustomerPurchaseHistory | null, loading: boolean, error: boolean) => {
      if (!cancelled) setState({ key, snapshot, loading, error });
    };
    void (async () => {
      let cached = latest.current.key === key ? latest.current.snapshot : null;
      publish(cached, true, false);
      try { cached = await readCustomerPurchaseHistory(userId, organizationGuid, counterpartyGuid) || cached; } catch { /* API is still usable. */ }
      if (cancelled) return;
      publish(cached, online, false);
      if (!online) return;
      const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
      if (!force && cached && age >= 0 && age < 300000) { publish(cached, false, false); return; }
      try {
        const result = await apiClient<void, CustomerPurchaseHistory>(`/api/client-orders/purchase-history?organizationGuid=${encodeURIComponent(organizationGuid)}&counterpartyGuid=${encodeURIComponent(counterpartyGuid)}`, { timeoutMs: 15000 });
        if (cancelled) return;
        if (!result.ok || !isPurchaseHistory(result.data, counterpartyGuid, organizationGuid)) throw new Error('History unavailable');
        // A device-storage failure must not disable the online picker. The
        // SQLite filter verifies fetchedAt and falls back to API when its
        // snapshot differs from the one currently displayed.
        try {
          await writeCustomerPurchaseHistory(userId, result.data);
          publish(result.data, false, false);
        } catch { publish(result.data, false, true); }
      } catch { publish(cached, false, true); }
    })();
    return () => { cancelled = true; };
  }, [key, userId, organizationGuid, counterpartyGuid, enabled, online, retry]);
  const snapshot = state.key === key ? state.snapshot : null;
  const dates = React.useMemo(() => new Map(snapshot?.items.map(item => [item.productGuid, item.lastPurchasedDate]) || []), [snapshot]);
  return { snapshot, dates, ready: !!snapshot, loading: state.key === key && state.loading,
    error: state.key === key && state.error, refresh: () => setRetry(value => value + 1) };
}
