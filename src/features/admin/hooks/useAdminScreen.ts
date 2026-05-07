import { useIsAdmin } from '@/hooks/useIsAdmin';
import React from 'react';
import type { AdminTabKey } from '../types';

export default function useAdminScreen() {
  const { isAdmin, isCheckingAdmin } = useIsAdmin();
  const [activeTab, setActiveTab] = React.useState<AdminTabKey>('users');
  const [queuedUserId, setQueuedUserId] = React.useState<number | null>(null);

  return {
    isAdmin,
    isCheckingAdmin,
    activeTab,
    queuedUserId,
    setActiveTab,
    setQueuedUserId,
  };
}
