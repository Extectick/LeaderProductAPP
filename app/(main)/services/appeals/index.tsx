import { useMemo, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { View, Alert, Pressable, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppealsList from '@/components/Appeals/AppealList';
import { exportAppealsCSV, getAppealsCounters, getAppealsList } from '@/utils/appealsService';
import { AppealCounters, AppealListItem, AppealPriority, AppealStatus, Scope } from '@/types/appealsTypes';
import * as FileSystem from 'expo-file-system';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';
import { AuthContext } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
// import * as Sharing from 'expo-sharing';

type AppealsViewMode = 'active' | 'in_progress' | 'completed' | 'all';
const APPEALS_FILTERS_KEY = 'appeals:list:filters:v1';

export default function AppealsIndex() {
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });
  const tabBarSpacerHeight = useTabBarSpacerHeight();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const router = useRouter();
  const auth = useContext(AuthContext);
  const [status] = useState<AppealStatus | undefined>();
  const [priority] = useState<AppealPriority | undefined>();
  const [wsTick, setWsTick] = useState(0);
  const [tab, setTab] = useState<'mine' | 'tasks'>('mine');
  const [viewMode, setViewMode] = useState<AppealsViewMode>('active');
  const [onlyAssignedToMe, setOnlyAssignedToMe] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [filtersPanelVisible, setFiltersPanelVisible] = useState(false);
  const [counters, setCounters] = useState<AppealCounters | null>(null);
  const listScope: Scope = tab === 'mine' ? 'my' : 'department';
  const countersRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listKey = useMemo(
    () => `scope:${listScope}-status:${status ?? 'any'}-priority:${priority ?? 'any'}`,
    [listScope, priority, status]
  );
  const [cachedItems, setCachedItems] = useState(getListSnapshot(listKey).items);
  const lastWsMsg = useRef<any>(null);

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
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(APPEALS_FILTERS_KEY);
        if (active && raw) {
          const parsed = JSON.parse(raw) as Partial<{
            viewMode: AppealsViewMode;
            onlyAssignedToMe: boolean;
          }>;
          if (parsed.viewMode && ['active', 'in_progress', 'completed', 'all'].includes(parsed.viewMode)) {
            setViewMode(parsed.viewMode);
          }
          if (typeof parsed.onlyAssignedToMe === 'boolean') {
            setOnlyAssignedToMe(parsed.onlyAssignedToMe);
          }
        }
      } catch {}
      if (active) setFiltersReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    void AsyncStorage.setItem(
      APPEALS_FILTERS_KEY,
      JSON.stringify({ viewMode, onlyAssignedToMe })
    ).catch(() => undefined);
  }, [filtersReady, viewMode, onlyAssignedToMe]);

  useEffect(() => {
    void loadCounters();
  }, [loadCounters]);

  useEffect(() => {
    if (!departmentTabAvailable && tab === 'tasks') {
      setTab('mine');
    }
  }, [departmentTabAvailable, tab]);

  useEffect(() => {
    setFiltersPanelVisible(false);
  }, [tab]);

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

  const displayFilter = useCallback(
    (item: AppealListItem) => {
      const statusValue = item.status;
      const isCompleted = statusValue === 'COMPLETED' || statusValue === 'DECLINED';
      if (viewMode === 'active' && isCompleted) return false;
      if (viewMode === 'completed' && !isCompleted) return false;
      if (viewMode === 'in_progress' && statusValue !== 'IN_PROGRESS') return false;
      if (onlyAssignedToMe && auth?.profile?.id) {
        const assignedToMe = (item.assignees || []).some((a) => a.user?.id === auth.profile?.id);
        if (!assignedToMe) return false;
      }
      return true;
    },
    [auth?.profile?.id, onlyAssignedToMe, viewMode]
  );

  const visibleItemsCount = useMemo(
    () => cachedItems.filter(displayFilter).length,
    [cachedItems, displayFilter]
  );

  const resetFilters = useCallback(() => {
    setViewMode('active');
    setOnlyAssignedToMe(false);
  }, []);
  const hasNonDefaultFilters = viewMode !== 'active' || onlyAssignedToMe;

  const listEmptyComponent = useMemo(() => {
    if (cachedItems.length === 0) {
      if (tab === 'mine') {
        return (
          <View style={styles.emptyCard}>
            <Ionicons name="chatbubbles-outline" size={32} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>Пока нет обращений</Text>
            <Text style={styles.emptyHint}>
              Создайте первое обращение, чтобы начать диалог с отделами и отслеживать статус выполнения.
            </Text>
            <Pressable
              onPress={() => router.push('/(main)/services/appeals/new')}
              style={({ pressed }) => [styles.emptyCreateBtn, pressed && styles.emptyCreateBtnPressed]}
            >
              <Ionicons name="add" size={18} color="#0B1220" />
              <Text style={styles.emptyCreateBtnText}>Создать обращение</Text>
            </Pressable>
          </View>
        );
      }

      return (
        <View style={styles.emptyCard}>
          <Ionicons name="briefcase-outline" size={30} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>Задач отдела пока нет</Text>
          <Text style={styles.emptyHint}>Когда появятся обращения по вашему отделу, они будут отображаться здесь.</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyCard}>
        <Ionicons name="filter-outline" size={30} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>По текущим фильтрам ничего не найдено</Text>
        <Text style={styles.emptyHint}>Измените фильтры или сбросьте их, чтобы увидеть больше обращений.</Text>
        <Pressable onPress={resetFilters} style={({ pressed }) => [styles.emptyResetBtn, pressed && { opacity: 0.9 }]}>
          <Text style={styles.emptyResetBtnText}>Сбросить фильтры</Text>
        </Pressable>
      </View>
    );
  }, [cachedItems.length, resetFilters, router, tab]);

  const modeOptions: { key: AppealsViewMode; label: string }[] = [
    { key: 'active', label: 'Активные' },
    { key: 'in_progress', label: 'В работе' },
    { key: 'completed', label: 'Завершённые' },
    { key: 'all', label: 'Все' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View
        style={{
          width: '100%',
          maxWidth: 1100,
          alignSelf: 'center',
          paddingHorizontal: 12,
          paddingTop: 4 + headerTopInset,
          paddingBottom: 10,
          flex: 1,
        }}
      >
        <View style={styles.controlsBlock}>
          <View style={styles.scopeSwitch}>
            <Pressable
              onPress={() => setTab('mine')}
              style={[styles.scopeItem, tab === 'mine' && styles.scopeItemActive]}
            >
              <View style={styles.scopeItemRow}>
                <Text style={[styles.scopeItemText, tab === 'mine' && styles.scopeItemTextActive]}>
                  {compact ? 'Мои' : 'Мои обращения'}
                </Text>
                {renderTabBadges(counters?.my)}
              </View>
            </Pressable>
            {departmentTabAvailable ? (
              <Pressable
                onPress={() => setTab('tasks')}
                style={[styles.scopeItem, tab === 'tasks' && styles.scopeItemActive]}
              >
                <View style={styles.scopeItemRow}>
                  <Text style={[styles.scopeItemText, tab === 'tasks' && styles.scopeItemTextActive]}>
                    {compact ? 'Отдел' : 'Задачи отдела'}
                  </Text>
                  {renderTabBadges(counters?.department)}
                </View>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.filterRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScrollContent}
              style={styles.filterScroll}
            >
              {modeOptions.map((opt) => {
                const active = viewMode === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setViewMode(opt.key)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => setFiltersPanelVisible((v) => !v)}
              style={[styles.filterSettingsBtn, filtersPanelVisible && styles.filterSettingsBtnActive]}
            >
              <Ionicons
                name={filtersPanelVisible ? 'close-outline' : 'options-outline'}
                size={16}
                color={filtersPanelVisible ? '#1D4ED8' : '#4B5563'}
              />
            </Pressable>
          </View>

          <View style={styles.filterMetaRow}>
            <Text style={styles.filterMetaText}>
              {visibleItemsCount} из {cachedItems.length}
            </Text>
            {hasNonDefaultFilters ? (
              <Pressable onPress={resetFilters} style={({ pressed }) => [styles.metaResetBtn, pressed && { opacity: 0.85 }]}>
                <Text style={styles.metaResetText}>Сбросить</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {filtersPanelVisible ? (
          <View style={styles.filtersPanel}>
            <Pressable
              onPress={() => setOnlyAssignedToMe((v) => !v)}
              style={[styles.panelToggle, onlyAssignedToMe && styles.panelToggleActive]}
            >
              <Ionicons
                name={onlyAssignedToMe ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={onlyAssignedToMe ? '#1D4ED8' : '#6B7280'}
              />
              <Text style={[styles.panelToggleText, onlyAssignedToMe && styles.panelToggleTextActive]}>
                Только я исполнитель
              </Text>
            </Pressable>

            <View style={styles.panelActionsRow}>
              <Pressable
                onPress={() => {
                  void handleExport();
                }}
                style={[styles.panelActionBtn, styles.panelActionBtnPrimary]}
              >
                <Ionicons name="download-outline" size={14} color="#fff" />
                <Text style={styles.panelActionPrimaryText}>Экспорт CSV</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

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
          contentContainerStyle={{ paddingBottom: tabBarSpacerHeight + 8 }}
          displayFilter={displayFilter}
          ListEmptyComponent={listEmptyComponent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controlsBlock: {
    marginBottom: 8,
  },
  scopeSwitch: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    padding: 4,
    flexDirection: 'row',
    gap: 4,
  },
  scopeItem: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  scopeItemActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  scopeItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  scopeItemText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  scopeItemTextActive: {
    color: '#1D4ED8',
  },
  tabBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
  },
  activeCountText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  unreadChip: {
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: '#ECFEFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  unreadChipText: {
    color: '#0F766E',
    fontSize: 10,
    fontWeight: '800',
  },
  filterRow: {
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterScroll: {
    flex: 1,
    minHeight: 34,
  },
  filterScrollContent: {
    alignItems: 'center',
    gap: 6,
    paddingRight: 6,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  filterChipActive: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  filterChipText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#1D4ED8',
  },
  filterSettingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSettingsBtnActive: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  filterMetaRow: {
    marginTop: 2,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterMetaText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
  metaResetBtn: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F3F4F6',
  },
  metaResetText: {
    color: '#4B5563',
    fontSize: 11,
    fontWeight: '700',
  },
  filtersPanel: {
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 10,
    gap: 8,
  },
  panelToggle: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelToggleActive: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  panelToggleText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  panelToggleTextActive: {
    color: '#1D4ED8',
  },
  panelActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  panelActionBtn: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  panelActionBtnPrimary: {
    borderColor: '#2563EB',
    backgroundColor: '#2563EB',
  },
  panelActionPrimaryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
    textAlign: 'center',
  },
  emptyHint: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  emptyCreateBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  emptyCreateBtnPressed: {
    opacity: 0.92,
  },
  emptyCreateBtnText: {
    color: '#0B1220',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyResetBtn: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyResetBtnText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
});
