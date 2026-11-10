import React from 'react';

export function useCustomerPurchaseHistory() {
  return React.useMemo(() => {
    const items = new URLSearchParams(location.search).get('history') === '1'
      ? [{productGuid: '88888888-8888-4888-8888-000000000001', lastPurchasedDate: '2026-11-01'}]
      : [];
    return {
      snapshot: {fetchedAt: '2026-11-07T10:00:00Z', asOf: '2026-11-07T10:00:00Z', items},
      dates: new Map(items.map(item => [item.productGuid, item.lastPurchasedDate])),
      ready: true, loading: false, error: false, refresh: () => {},
    };
  }, []);
}
