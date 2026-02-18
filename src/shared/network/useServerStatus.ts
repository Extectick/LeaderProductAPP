import { useEffect, useState } from 'react';
import { getServerStatus, subscribeServerStatus } from '@/src/shared/network/serverStatus';

export function useServerStatus() {
  const [snapshot, setSnapshot] = useState(() => getServerStatus());

  useEffect(() => {
    return subscribeServerStatus(setSnapshot);
  }, []);

  return snapshot;
}

