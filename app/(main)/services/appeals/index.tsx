import { useMemo, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { View, Alert, Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppealsListHeader from '@/components/Appeals/AppealsListHeader';
import AppealsList from '@/components/Appeals/AppealList';
import { exportAppealsCSV, getAppealsCounters, getAppealsList } from '@/utils/appealsService';
import { AppealCounters, AppealPriority, AppealStatus, Scope } from '@/types/appealsTypes';
import * as FileSystem from 'expo-file-system';
import { OverflowMenuItem } from '@/components/ui/OverflowMenu';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';
import { AuthContext } from '@/context/AuthContext';
import {
  initAppealsStore,
  subscribe as subscribeAppeals,
  upsertMessage,
  updateMessage,
  removeMessage,
  patchAppeal,
  getListSnapshot,
  setListPage,
} from '@/utils/appealsStore';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
// import * as Sharing from 'expo-sharing';

export default function AppealsIndex() {
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });
  const router = useRouter();
  const auth = useContext(AuthContext);
  const [status] = useState<AppealStatus | undefined>();
  const [priority] = useState<AppealPriority | undefined>();
  const [wsTick, setWsTick] = useState(0);
  const [tab, setTab] = useState<'mine' | 'tasks'>('mine');
  const [counters, setCounters] = useState<AppealCounters | null>(null);
  const listScope: Scope = tab === 'mine' ? 'my' : 'department';
  const countersRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const loadCounters = useCallback(async () => {
    try {
      const data = await getAppealsCounters();
      setCounters(data);
    } catch (error) {
      console.warn('[Appeals] counters load failed:', error);
    }
  }, []);

  const scheduleCountersRefresh = useCallback(
    (delayMs = 500) => {
      if (countersRefreshTimerRef.current) {
        clearTimeout(countersRefreshTimerRef.current);
      }
      countersRefreshTimerRef.current = setTimeout(() => {
        void loadCounters();
      }, delayMs);
    },
    [loadCounters]
  );

  const formatBadgeCount = useCallback((value: number) => (value > 99 ? '99+' : String(value)), []);

  const renderTabBadges = useCallback(
    (data?: { activeCount: number; unreadMessagesCount: number }) => {
      if (!data) return null;
      const activeCount = Math.max(0, data.activeCount || 0);
      const unreadCount = Math.max(0, data.unreadMessagesCount || 0);
      if (activeCount === 0 && unreadCount === 0) return null;
      return (
        <View style={styles.tabBadges}>
          {activeCount > 0 ? (
            <View style={styles.activeCountBadge}>
              <Text style={styles.activeCountText}>{formatBadgeCount(activeCount)}</Text>
            </View>
          ) : null}
          {unreadCount > 0 ? (
            <View style={styles.unreadChip}>
              <Ionicons name="chatbubble-ellipses-outline" size={12} color="#0F766E" />
              <Text style={styles.unreadChipText}>{formatBadgeCount(unreadCount)}</Text>
            </View>
          ) : null}
        </View>
      );
    },
    [formatBadgeCount]
  );

  const departmentTabAvailable = counters?.department.available ?? true;

  useEffect(() => {
    void loadCounters();
  }, [loadCounters]);

  useEffect(() => {
    if (!departmentTabAvailable && tab === 'tasks') {
      setTab('mine');
    }
  }, [departmentTabAvailable, tab]);

  useEffect(() => {
    return () => {
      if (countersRefreshTimerRef.current) clearTimeout(countersRefreshTimerRef.current);
    };
  }, []);

  async function handleExport() {
    try {
      const blob: any = await exportAppealsCSV({ scope: listScope, status, priority });
      // Преобразуй blob в base64 если нужно — зависит от твоего apiClient
      const base64 = typeof blob === 'string' ? blob : ''; // подставь свою util-ку
      const baseDir =
        (FileSystem as any).cacheDirectory ||
        (FileSystem as any).documentDirectory ||
        '';
      const path = `${baseDir}appeals-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: 'base64' as const });
      // await Sharing.shareAsync(path);
    } catch {
      Alert.alert('Ошибка', 'Не удалось экспортировать CSV');
    }
  }

  // Когда приходят события по любому обращению - точечно обновляем без полного refetch
  const handleWsEvent = useCallback(
    (evt: any) => {
      const eventName = evt?.event || evt?.eventType || evt?.type;
      if (eventName === 'messageAdded') {
        lastWsMsg.current = evt;
        scheduleCountersRefresh();
        upsertMessage(
          evt.appealId,
          {
            id: evt.id || evt.messageId,
            appealId: evt.appealId,
            text: evt.text || '',
            type: evt.type,
            systemEvent: evt.systemEvent ?? null,
            editedAt: evt.editedAt ?? null,
            createdAt: evt.createdAt || new Date().toISOString(),
            sender: evt.sender || { id: evt.senderId, email: '' },
            attachments: evt.attachments || [],
            readBy: evt.readBy || [],
            isRead: evt.isRead || false,
          },
          auth?.profile?.id
        ).then(() => {
          setCachedItems(getListSnapshot(listKey).items);
        });
      } else if (eventName === 'messageEdited') {
        if (evt?.appealId && evt?.messageId) {
          updateMessage(evt.appealId, evt.messageId, { text: evt.text, editedAt: evt.editedAt }).catch(() => {});
        }
      } else if (eventName === 'messageDeleted') {
        scheduleCountersRefresh();
        if (evt?.appealId && evt?.messageId) {
          removeMessage(evt.appealId, evt.messageId).catch(() => {});
        }
      } else if (eventName === 'appealUpdated' && evt?.appealId) {
        scheduleCountersRefresh();
        const existing = getListSnapshot(listKey).items.find((x) => x.id === evt.appealId);
        const patch: any = {};
        if (evt.status) patch.status = evt.status;
        if (evt.priority) patch.priority = evt.priority;
        if (evt.updatedAt) patch.updatedAt = evt.updatedAt;
        if (Array.isArray(evt.assigneeIds)) {
          patch.assignees = evt.assigneeIds.map((id: number) => ({ user: { id, email: '' } }));
        }
        if (evt.lastMessage) {
          patch.lastMessage = evt.lastMessage;
          lastWsMsg.current = evt.lastMessage;
          upsertMessage(evt.appealId, evt.lastMessage, auth?.profile?.id).catch(() => {});
        }
        patchAppeal(evt.appealId, patch).catch(() => {});
        if (existing?.toDepartment?.id && evt.toDepartmentId && existing.toDepartment.id !== evt.toDepartmentId) {
          setWsTick((t) => t + 1);
        }
      } else if (
        evt?.appealId &&
        (eventName === 'statusUpdated' ||
          eventName === 'assigneesUpdated' ||
          eventName === 'departmentChanged')
      ) {
        scheduleCountersRefresh();
        // Для старых событий без агрегированного payload делаем мягкий fallback
        setWsTick((t) => t + 1);
      } else {
        if (eventName === 'messageRead') {
          scheduleCountersRefresh();
        }
        setWsTick((t) => t + 1);
      }
    },
    [auth?.profile?.id, listKey, scheduleCountersRefresh]
  );

  useAppealUpdates(
    undefined,
    handleWsEvent,
    auth?.profile?.id ?? undefined,
    auth?.profile?.departmentRoles?.map((d) => d.department.id) ||
      auth?.profile?.employeeProfile?.department?.id
  );

  const refreshKey = useMemo(
    () => `${tab}-${status ?? ''}-${priority ?? ''}-${wsTick}`,
    [tab, status, priority, wsTick],
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
            onPress={() => {
              setTab('mine');
            }}
            style={[styles.tab, tab === 'mine' && styles.tabActive]}
          >
            <View style={styles.tabInner}>
              <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>Мои обращения</Text>
              {renderTabBadges(counters?.my)}
            </View>
          </Pressable>
          {departmentTabAvailable ? (
            <Pressable
              onPress={() => {
                setTab('tasks');
              }}
              style={[styles.tab, tab === 'tasks' && styles.tabActive]}
            >
              <View style={styles.tabInner}>
                <Text style={[styles.tabText, tab === 'tasks' && styles.tabTextActive]}>
                  Задачи отдела
                </Text>
                {renderTabBadges(counters?.department)}
              </View>
            </Pressable>
          ) : null}
        </View>

        <AppealsList
          scope={listScope}
          status={status}
          priority={priority}
          pageSize={20}
          refreshKey={refreshKey}
          onLoadedMeta={() => {}}
          currentUserId={auth?.profile?.id}
          incomingMessage={lastWsMsg.current as any}
          initialItems={cachedItems}
          listKey={listKey}
          onItemsChange={(items) => setCachedItems(items)}
          onRefreshDone={() => {
            void loadCounters();
          }}
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
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  tabActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  tabText: { fontWeight: '700', color: '#4B5563', textAlign: 'center', flexShrink: 1 },
  tabTextActive: { color: '#1D4ED8' },
  tabBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
  },
  activeCountText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  unreadChip: {
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: '#ECFEFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  unreadChipText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '800',
  },
});
