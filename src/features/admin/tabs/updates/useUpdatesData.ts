import { Alert } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { getUpdatesList, type UpdateItem } from '@/utils/updateAdminService';

export function useUpdatesData(active: boolean) {
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);

  const loadUpdates = useCallback(async () => {
    setUpdatesLoading(true);
    try {
      const data = await getUpdatesList({ limit: 100 });
      setUpdates(data.data);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось загрузить обновления');
    } finally {
      setUpdatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadUpdates();
  }, [active, loadUpdates]);

  return {
    updates,
    setUpdates,
    updatesLoading,
    setUpdatesLoading,
    loadUpdates,
  };
}
