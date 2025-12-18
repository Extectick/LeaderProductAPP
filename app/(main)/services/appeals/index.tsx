import { useMemo, useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import AppealsListHeader from '@/components/Appeals/AppealsListHeader';
import AppealsList from '@/components/Appeals/AppealList';
import { exportAppealsCSV } from '@/utils/appealsService';
import { AppealPriority, AppealStatus, Scope } from '@/types/appealsTypes';
import * as FileSystem from 'expo-file-system';
import { OverflowMenuItem } from '@/components/ui/OverflowMenu';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';
// import * as Sharing from 'expo-sharing';

export default function AppealsIndex() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('my');
  const [status, setStatus] = useState<AppealStatus | undefined>();
  const [priority, setPriority] = useState<AppealPriority | undefined>();
  const [count, setCount] = useState(0);
  const [wsTick, setWsTick] = useState(0);
  const menuItems: OverflowMenuItem[] = [
    { key: 'export', title: 'Экспорт', icon: 'download', onPress: handleExport },
    // добавляй/убирай пункты здесь
  ];
  async function handleExport() {
    try {
      const blob: any = await exportAppealsCSV({ scope, status, priority });
      // Преобразуй blob в base64 если нужно — зависит от твоего apiClient
      const base64 = typeof blob === 'string' ? blob : ''; // подставь свою util-ку
      const baseDir =
        (FileSystem as any).cacheDirectory ||
        (FileSystem as any).documentDirectory ||
        '';
      const path = `${baseDir}appeals-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: 'base64' as const });
      // await Sharing.shareAsync(path);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось экспортировать CSV');
    }
  }

  // Когда приходят события по любому обращению — обновляем список
  useAppealUpdates(undefined, () => setWsTick((t) => t + 1));

  const refreshKey = useMemo(
    () => `${scope}-${status ?? ''}-${priority ?? ''}-${wsTick}`,
    [scope, status, priority, wsTick],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 16, maxWidth: 1000 }}>
      <AppealsListHeader
        onCreate={() => router.push('/(main)/services/appeals/new')}
        menuItems={menuItems}
      />

      <AppealsList
        scope={scope}
        status={status}
        priority={priority}
        pageSize={20}
        refreshKey={refreshKey}
        onLoadedMeta={(m) => setCount(m.total ?? 0)}
      />
    </View>
  );
}
