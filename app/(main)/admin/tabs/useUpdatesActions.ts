import { Alert, Platform } from 'react-native';
import { useCallback } from 'react';
import { cleanupUpdates, deleteUpdate, type UpdateItem, updateUpdate } from '@/utils/updateAdminService';

type NotifyType = 'success' | 'error' | 'info';
type NotifyFn = (type: NotifyType, text: string) => void;

export function useUpdatesActions(params: {
  loadUpdates: () => Promise<void>;
  notify: NotifyFn;
  cleanupKeepLatest: string;
  cleanupPurgeFile: boolean;
}) {
  const { loadUpdates, notify, cleanupKeepLatest, cleanupPurgeFile } = params;

  const handleDeleteUpdate = useCallback(
    async (item: UpdateItem) => {
      if (Platform.OS === 'web') {
        const confirmDelete = typeof window !== 'undefined' ? window.confirm('Удалить обновление?') : true;
        if (!confirmDelete) return;
        try {
          await deleteUpdate(item.id, true);
          await loadUpdates();
          notify('success', `Обновление #${item.id} удалено`);
        } catch (e: any) {
          notify('error', e?.message || 'Не удалось удалить');
        }
        return;
      }
      Alert.alert('Удалить обновление?', 'Запись будет удалена', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUpdate(item.id, true);
              await loadUpdates();
              notify('success', `Обновление #${item.id} удалено`);
            } catch (e: any) {
              notify('error', e?.message || 'Не удалось удалить');
            }
          },
        },
      ]);
    },
    [loadUpdates, notify]
  );

  const handleToggleActive = useCallback(
    async (item: UpdateItem) => {
      try {
        await updateUpdate(item.id, { isActive: !item.isActive });
        await loadUpdates();
        notify('success', `Обновление #${item.id} обновлено`);
      } catch (e: any) {
        notify('error', e?.message || 'Не удалось обновить запись');
      }
    },
    [loadUpdates, notify]
  );

  const handleCleanup = useCallback(async () => {
    const keepLatest = Math.max(parseInt(cleanupKeepLatest || '1', 10) || 1, 1);
    try {
      const result = await cleanupUpdates({
        keepLatest,
        purgeFile: cleanupPurgeFile,
      });
      notify('success', `Удалено: ${result.deletedCount}`);
      await loadUpdates();
    } catch (e: any) {
      notify('error', e?.message || 'Не удалось выполнить очистку');
    }
  }, [cleanupKeepLatest, cleanupPurgeFile, loadUpdates, notify]);

  return {
    handleDeleteUpdate,
    handleToggleActive,
    handleCleanup,
  };
}
