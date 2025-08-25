import { useMemo, useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import AppealsListHeader from '@/components/Appeals/AppealsListHeader';
import AppealsList from '@/components/Appeals/AppealList';
import { exportAppealsCSV } from '@/utils/appealsService';
import { AppealPriority, AppealStatus, Scope } from '@/types/appealsTypes';
import * as FileSystem from 'expo-file-system';
import { OverflowMenuItem } from '@/components/ui/OverflowMenu';
// import * as Sharing from 'expo-sharing';

export default function AppealsIndex() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('my');
  const [status, setStatus] = useState<AppealStatus | undefined>();
  const [priority, setPriority] = useState<AppealPriority | undefined>();
  const [count, setCount] = useState(0);
  const menuItems: OverflowMenuItem[] = [
    { key: 'export', title: 'Экспорт', icon: 'download', onPress: handleExport },
    // добавляй/убирай пункты здесь
  ];
  async function handleExport() {
    try {
      const blob: any = await exportAppealsCSV({ scope, status, priority });
      // Преобразуй blob в base64 если нужно — зависит от твоего apiClient
      const base64 = typeof blob === 'string' ? blob : ''; // подставь свою util-ку
      const path = FileSystem.documentDirectory + `appeals-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
      // await Sharing.shareAsync(path);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось экспортировать CSV');
    }
  }

  const refreshKey = useMemo(() => `${scope}-${status ?? ''}-${priority ?? ''}`, [scope, status, priority]);

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
