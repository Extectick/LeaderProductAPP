import { useEffect, useMemo, useState } from 'react';
import { getAppealsOutboxSnapshot, subscribeAppealsOutbox } from '@/src/features/appeals/sync/outbox';

export function useAppealsOutboxStats() {
  const [items, setItems] = useState(() => getAppealsOutboxSnapshot());

  useEffect(() => {
    return subscribeAppealsOutbox(setItems);
  }, []);

  return useMemo(() => {
    const pending = items.filter((item) => item.status === 'pending').length;
    const failed = items.filter((item) => item.status === 'failed').length;
    const total = items.length;
    return { pending, failed, total };
  }, [items]);
}
