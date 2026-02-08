import { useMemo, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { View, Alert, Pressable, Text, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AppealsListHeader from '@/components/Appeals/AppealsListHeader';
import AppealsList from '@/components/Appeals/AppealList';
import { exportAppealsCSV } from '@/utils/appealsService';
import { AppealPriority, AppealStatus, Scope } from '@/types/appealsTypes';
import * as FileSystem from 'expo-file-system';
import { OverflowMenuItem } from '@/components/ui/OverflowMenu';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';
import { AuthContext } from '@/context/AuthContext';
import {
  initAppealsStore,
  subscribe as subscribeAppeals,
  upsertMessage,
  getListSnapshot,
  setListPage,
} from '@/utils/appealsStore';
import { getAppealsList } from '@/utils/appealsService';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
// import * as Sharing from 'expo-sharing';

export default function AppealsIndex() {
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });
  const router = useRouter();
  const auth = useContext(AuthContext);
  const [scope, setScope] = useState<Scope>('my');
  const [status, setStatus] = useState<AppealStatus | undefined>();
  const [priority, setPriority] = useState<AppealPriority | undefined>();
  const [count, setCount] = useState(0);
  const [wsTick, setWsTick] = useState(0);
  const [tab, setTab] = useState<'mine' | 'tasks'>('mine');
  const listScope: Scope = tab === 'mine' ? 'my' : 'department';
  const listKey = useMemo(
    () => `scope:${listScope}-status:${status ?? 'any'}-priority:${priority ?? 'any'}`,
    [listScope, priority, status]
  );
  const [cachedItems, setCachedItems] = useState(getListSnapshot(listKey).items);
  const lastWsMsg = useRef<any>(null);
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

  // Когда приходят события по любому обращению - точечно обновляем по messageAdded, иначе рефреш
  const handleWsEvent = useCallback(
    (evt: any) => {
      if (evt?.type === 'messageAdded') {
        lastWsMsg.current = evt;
        upsertMessage(
          evt.appealId,
          {
            id: evt.id || evt.messageId,
            appealId: evt.appealId,
            text: evt.text || '',
            createdAt: evt.createdAt || new Date().toISOString(),
            sender: evt.sender || { id: evt.senderId, email: '' },
            attachments: evt.attachments || [],
            readBy: evt.readBy || [],
            isRead: evt.isRead || false,
          },
          auth?.profile?.id
        ).then(() => {
          setCachedItems(getListSnapshot(listKey).items);
          setWsTick((t) => t + 1); // гарантируем перерисовку списка
        });
      } else {
        setWsTick((t) => t + 1);
      }
    },
    [auth?.profile?.id, listKey]
  );

  useAppealUpdates(
    undefined,
    handleWsEvent,
    auth?.profile?.id ?? undefined,
    auth?.profile?.departmentRoles?.map((d) => d.department.id) ||
      auth?.profile?.employeeProfile?.department?.id
  );

  const refreshKey = useMemo(
    () => `${tab}-${scope}-${status ?? ''}-${priority ?? ''}-${wsTick}`,
    [tab, scope, status, priority, wsTick],
  );

  // Меняем scope при смене таба
  const filterTasks = (items: any[]) => {
    if (tab !== 'tasks') return items;
    const myId = auth?.profile?.id;
    if (!myId) return items;
    return items.filter((it) => it.createdById !== myId);
  };

  // При возвращении на экран форсируем обновление списка (например, после создания обращения)
  useFocusEffect(
    useMemo(
      () => () => {
        setWsTick((t) => t + 1);
      },
      []
    )
  );

  // Инициализация локального кэша обращений и подписка
  useEffect(() => {
    initAppealsStore().then(() => {
      setCachedItems(getListSnapshot(listKey).items);
      // если кэш пустой - подтягиваем с сервера и кладём в стор
      if (getListSnapshot(listKey).items.length === 0) {
        getAppealsList(listScope, 20, 0, { forceRefresh: true })
          .then((res) =>
            setListPage(
              listKey,
              res.data,
              { total: res.meta?.total, limit: res.meta?.limit, offset: res.meta?.offset },
              true
            )
          )
          .then(() => setCachedItems(getListSnapshot(listKey).items))
          .catch(() => {});
      }
    });
    const unsub = subscribeAppeals(() => setCachedItems(getListSnapshot(listKey).items));
    return () => unsub();
  }, [listKey, listScope]);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View
        style={{
          width: '100%',
          maxWidth: 1100,
          alignSelf: 'center',
          paddingHorizontal: 16,
          paddingTop: 12 + headerTopInset,
          paddingBottom: 12,
          flex: 1,
        }}
      >
        <AppealsListHeader
          onCreate={() => router.push('/(main)/services/appeals/new')}
          menuItems={menuItems}
        />

        <View style={styles.tabs}>
          <Pressable
            onPress={() => { setTab('mine'); setScope('my'); }}
            style={[styles.tab, tab === 'mine' && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>Мои обращения</Text>
          </Pressable>
          <Pressable
            onPress={() => { setTab('tasks'); setScope('department'); }}
            style={[styles.tab, tab === 'tasks' && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === 'tasks' && styles.tabTextActive]}>Задачи отдела</Text>
          </Pressable>
        </View>

        <AppealsList
          scope={listScope}
          status={status}
          priority={priority}
          pageSize={20}
          refreshKey={refreshKey}
          onLoadedMeta={(m) => setCount(m.total ?? 0)}
          filterItems={filterTasks}
          currentUserId={auth?.profile?.id}
          incomingMessage={lastWsMsg.current as any}
          initialItems={cachedItems}
          listKey={listKey}
          onItemsChange={(items) => setCachedItems(items)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    width: '100%',
  },
  tab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  tabText: { fontWeight: '700', color: '#4B5563', textAlign: 'center', flexShrink: 1 },
  tabTextActive: { color: '#1D4ED8' },
});
