import { useMemo, useState, useContext, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Alert,
  Pressable,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppealsList from '@/components/Appeals/AppealList';
import AppealListItemForm from '@/components/Appeals/AppealListItemForm';
import AppealDetailContent from '@/components/Appeals/AppealDetailContent';
import { exportAppealsCSV, getAppealsCounters, getAppealsList } from '@/utils/appealsService';
import { AppealCounters, AppealListItem, AppealPriority, AppealStatus, Scope } from '@/src/entities/appeal/types';
import * as FileSystem from 'expo-file-system';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';
import useWebSidebarMetrics from '@/hooks/useWebSidebarMetrics';
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
import { useAppealsOutboxStats } from '@/src/features/appeals/hooks/useAppealsOutboxStats';
import {
  DESKTOP_CHAT_MAX_WIDTH,
  DESKTOP_CHAT_MIN_WIDTH,
  DESKTOP_CHAT_PREFERRED_WIDTH,
  DESKTOP_GAP,
  DESKTOP_INBOX_MAX_WIDTH,
  DESKTOP_INBOX_MIN_WIDTH,
  DESKTOP_INBOX_PREFERRED_WIDTH,
  DESKTOP_LEFT_PAGE_INSET,
  DESKTOP_SIDE_PADDING,
  DESKTOP_SPLIT_ENTER_WIDTH,
  DESKTOP_SPLIT_EXIT_WIDTH,
  WEB_SIDEBAR_BREAKPOINT,
} from '@/components/Appeals/desktopLayoutConfig';
// import * as Sharing from 'expo-sharing';

type AppealsViewMode = 'active' | 'in_progress' | 'completed' | 'all';
const APPEALS_FILTERS_KEY = 'appeals:list:filters:v1';
const APPEAL_FORCE_PAGE_ONCE_KEY = 'lp:appeals:force-page-once:v1';

export default function AppealsIndex() {
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });
  const tabBarSpacerHeight = useTabBarSpacerHeight();
  const searchParams = useLocalSearchParams<{ appealId?: string }>();
  const { width } = useWindowDimensions();
  const { sidebarWidthPx } = useWebSidebarMetrics();
  const [containerWidth, setContainerWidth] = useState(0);
  const compact = width < 390;
  const usesWebSidebar = Platform.OS === 'web' && width > WEB_SIDEBAR_BREAKPOINT;
  const fallbackContentWidth = usesWebSidebar ? Math.max(0, width - sidebarWidthPx) : width;
  const effectiveContentWidth = containerWidth > 0 ? containerWidth : fallbackContentWidth;
  const splitBasisWidth = Math.max(0, effectiveContentWidth - DESKTOP_LEFT_PAGE_INSET);
  const routingBasisWidth = Math.max(0, fallbackContentWidth - DESKTOP_LEFT_PAGE_INSET);
  const [splitEligible, setSplitEligible] = useState(() => {
    if (Platform.OS !== 'web') return false;
    return splitBasisWidth >= DESKTOP_SPLIT_ENTER_WIDTH;
  });
  const splitDecisionReady = Platform.OS !== 'web' || containerWidth > 0;
  const handleContainerLayout = useCallback((event: any) => {
    const nextWidth = Math.round(event?.nativeEvent?.layout?.width || 0);
    if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
    setContainerWidth((prev) => (Math.abs(prev - nextWidth) >= 1 ? nextWidth : prev));
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') {
      setSplitEligible(false);
      return;
    }
    setSplitEligible((prev) => (prev ? splitBasisWidth >= DESKTOP_SPLIT_EXIT_WIDTH : splitBasisWidth >= DESKTOP_SPLIT_ENTER_WIDTH));
  }, [splitBasisWidth]);
  const desktopLayout = useMemo(() => {
    if (Platform.OS !== 'web') return null;
    if (!splitEligible) return null;
    const usable = Math.max(0, splitBasisWidth - DESKTOP_SIDE_PADDING * 2);
    const minRowWidth = DESKTOP_INBOX_MIN_WIDTH + DESKTOP_GAP + DESKTOP_CHAT_MIN_WIDTH;
    if (usable < minRowWidth) return null;

    let inboxWidth = Math.round(
      Math.min(DESKTOP_INBOX_MAX_WIDTH, Math.max(DESKTOP_INBOX_MIN_WIDTH, DESKTOP_INBOX_PREFERRED_WIDTH))
    );
    let chatWidth = DESKTOP_CHAT_PREFERRED_WIDTH;

    const preferredRowWidth = inboxWidth + DESKTOP_GAP + chatWidth;
    if (preferredRowWidth > usable) {
      chatWidth = Math.max(DESKTOP_CHAT_MIN_WIDTH, usable - inboxWidth - DESKTOP_GAP);
    }
    if (inboxWidth + DESKTOP_GAP + chatWidth > usable) {
      inboxWidth = Math.max(DESKTOP_INBOX_MIN_WIDTH, usable - DESKTOP_GAP - chatWidth);
    }
    if (inboxWidth + DESKTOP_GAP + chatWidth > usable) {
      return null;
    }

    chatWidth = Math.round(Math.min(DESKTOP_CHAT_MAX_WIDTH, Math.max(DESKTOP_CHAT_MIN_WIDTH, chatWidth)));
    inboxWidth = Math.round(Math.min(DESKTOP_INBOX_MAX_WIDTH, Math.max(DESKTOP_INBOX_MIN_WIDTH, inboxWidth)));
    const rowWidth = inboxWidth + DESKTOP_GAP + chatWidth;
    const rawOffset = usable / 2 - (inboxWidth + DESKTOP_GAP + chatWidth / 2);
    const maxOffset = Math.max(0, usable - rowWidth);
    const leftOffset = Math.max(0, Math.min(maxOffset, Math.round(rawOffset)));

    return { gap: DESKTOP_GAP, inboxWidth, chatWidth, leftOffset };
  }, [splitBasisWidth, splitEligible]);
  const isDesktopSplit = Platform.OS === 'web' && !!desktopLayout;
  const shouldForcePageMode = Platform.OS === 'web' && splitDecisionReady && routingBasisWidth <= DESKTOP_SPLIT_EXIT_WIDTH;
  const markForcePageOnce = useCallback((appealId: number) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        APPEAL_FORCE_PAGE_ONCE_KEY,
        JSON.stringify({ appealId, at: Date.now() })
      );
    } catch {}
  }, []);
  const router = useRouter();
  const auth = useContext(AuthContext);
  const [status] = useState<AppealStatus | undefined>();
  const [priority] = useState<AppealPriority | undefined>();
  const [wsTick, setWsTick] = useState(0);
  const [tab, setTab] = useState<'mine' | 'tasks'>('mine');
  const [scopeSwitchLoading, setScopeSwitchLoading] = useState(false);
  const [viewMode, setViewMode] = useState<AppealsViewMode>('active');
  const [onlyAssignedToMe, setOnlyAssignedToMe] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [filtersPanelVisible, setFiltersPanelVisible] = useState(false);
  const outboxStats = useAppealsOutboxStats();
  const [counters, setCounters] = useState<AppealCounters | null>(null);
  const listScope: Scope = tab === 'mine' ? 'my' : 'department';
  const countersRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listKey = useMemo(
    () => `scope:${listScope}-status:${status ?? 'any'}-priority:${priority ?? 'any'}`,
    [listScope, priority, status]
  );
  const [cachedItems, setCachedItems] = useState(getListSnapshot(listKey).items);
  const lastWsMsg = useRef<any>(null);
  const selectedAppealIdFromQuery = useMemo(() => {
    const value = Number(searchParams.appealId);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [searchParams.appealId]);
  const [activeAppealId, setActiveAppealId] = useState<number | null>(selectedAppealIdFromQuery);

  useEffect(() => {
    setActiveAppealId(selectedAppealIdFromQuery);
  }, [selectedAppealIdFromQuery]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!splitDecisionReady) return;
    if (!shouldForcePageMode) return;
    if (!selectedAppealIdFromQuery) return;
    markForcePageOnce(selectedAppealIdFromQuery);
    router.replace(`/services/appeals/${selectedAppealIdFromQuery}` as any);
  }, [markForcePageOnce, router, selectedAppealIdFromQuery, shouldForcePageMode, splitDecisionReady]);


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
      if (!activeCount && !unreadCount) return null;
      return (
        <View style={styles.tabBadgesRow}>
          {activeCount ? (
            <View style={styles.tabCountBadge}>
              <Text style={styles.tabCountText}>{formatBadgeCount(activeCount)}</Text>
            </View>
          ) : null}
          {unreadCount ? (
            <View style={[styles.tabCountBadge, styles.tabUnreadBadge]}>
              <Ionicons name="chatbubble-ellipses-outline" size={11} color="#FFFFFF" />
              <Text style={[styles.tabCountText, styles.tabUnreadText]}>
                {formatBadgeCount(unreadCount)}
              </Text>
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
      setScopeSwitchLoading(false);
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

  const handleSelectAppeal = useCallback(
    (appealId: number) => {
      if (!isDesktopSplit) {
        markForcePageOnce(appealId);
        router.push(`/services/appeals/${appealId}` as any);
        return;
      }
      if (activeAppealId === appealId && selectedAppealIdFromQuery === appealId) {
        return;
      }
      setActiveAppealId(appealId);
      if (selectedAppealIdFromQuery !== appealId) {
        router.setParams({ appealId: String(appealId) } as any);
      }
    },
    [activeAppealId, isDesktopSplit, markForcePageOnce, router, selectedAppealIdFromQuery]
  );

  const clearSelectedAppeal = useCallback(() => {
    if (activeAppealId === null && selectedAppealIdFromQuery === null) {
      return;
    }
    setActiveAppealId(null);
    if (selectedAppealIdFromQuery !== null) {
      router.setParams({ appealId: undefined } as any);
    }
  }, [activeAppealId, router, selectedAppealIdFromQuery]);

  const switchScopeTab = useCallback((nextTab: 'mine' | 'tasks') => {
    if (tab === nextTab) return;
    setScopeSwitchLoading(true);
    setTab(nextTab);
  }, [tab]);

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

  const appealsListElement = (
    <AppealsList
      scope={listScope}
      status={status}
      priority={priority}
      pageSize={20}
      refreshKey={refreshKey}
      onLoadedMeta={() => {
        setScopeSwitchLoading(false);
      }}
      onLoadError={() => {
        setScopeSwitchLoading(false);
      }}
      currentUserId={auth?.profile?.id}
      incomingMessage={lastWsMsg.current as any}
      initialItems={cachedItems}
      listKey={listKey}
      onItemsChange={(items) => {
        setCachedItems(items);
        setScopeSwitchLoading(false);
      }}
      onRefreshDone={() => {
        void loadCounters();
        setScopeSwitchLoading(false);
      }}
      style={isDesktopSplit ? styles.desktopInboxList : undefined}
      contentContainerStyle={{ paddingBottom: isDesktopSplit ? 10 : tabBarSpacerHeight + 8 }}
      displayFilter={displayFilter}
      ListEmptyComponent={listEmptyComponent}
      renderItem={(item) => (
        <AppealListItemForm
          item={item}
          currentUserId={auth?.profile?.id}
          listContext={listScope}
          selected={isDesktopSplit ? activeAppealId === item.id : false}
          onPress={handleSelectAppeal}
          compact={isDesktopSplit}
        />
      )}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View
        onLayout={handleContainerLayout}
        style={[
          {
            width: '100%',
            maxWidth: isDesktopSplit ? undefined : 1100,
            alignSelf: isDesktopSplit ? 'stretch' : 'center',
            paddingLeft: isDesktopSplit ? DESKTOP_SIDE_PADDING + DESKTOP_LEFT_PAGE_INSET : 12,
            paddingRight: isDesktopSplit ? DESKTOP_SIDE_PADDING : 12,
            paddingTop: 4 + headerTopInset,
            paddingBottom: 10,
            flex: 1,
          },
          isDesktopSplit
            ? [
                styles.desktopSplitRoot,
                {
                  gap: desktopLayout!.gap,
                  paddingLeft: desktopLayout!.leftOffset,
                },
              ]
            : null,
        ]}
      >
        <View
          style={
            isDesktopSplit
              ? [styles.desktopLeftPane, { width: desktopLayout!.inboxWidth }]
              : styles.mobileLeftPane
          }
        >
          <View style={isDesktopSplit ? styles.desktopLeftShell : styles.mobileLeftShell}>
            <View style={[styles.controlsBlock, isDesktopSplit ? styles.desktopInboxTop : null]}>
            <View style={styles.scopeSwitch}>
              <Pressable
                onPress={() => switchScopeTab('mine')}
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
                  onPress={() => switchScopeTab('tasks')}
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
              {outboxStats.total > 0 ? (
                <Text
                  style={[
                    styles.filterMetaText,
                    outboxStats.failed > 0 ? styles.outboxMetaFailed : styles.outboxMetaPending,
                  ]}
                >
                  Очередь: {outboxStats.pending} в отправке, {outboxStats.failed} ошибок
                </Text>
              ) : null}
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

            <View style={styles.listHost}>
              {appealsListElement}
              {scopeSwitchLoading ? (
                <View style={styles.scopeLoaderOverlay}>
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text style={styles.scopeLoaderText}>Загрузка списка...</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {isDesktopSplit ? (
          <View style={[styles.desktopRightPane, { width: desktopLayout!.chatWidth }]}>
            <View style={styles.desktopChatShell}>
              {activeAppealId ? (
                <AppealDetailContent
                  appealId={activeAppealId}
                  mode="pane"
                  onClearSelection={clearSelectedAppeal}
                />
              ) : (
                <View style={styles.desktopPlaceholderCard}>
                  <Ionicons name="chatbubbles-outline" size={26} color="#64748B" />
                  <Text style={styles.desktopPlaceholderTitle}>Выберите обращение</Text>
                  <Text style={styles.desktopPlaceholderText}>
                    Откройте карточку из списка слева, чтобы увидеть переписку и действия по обращению.
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopSplitRoot: {
    width: '100%',
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  desktopLeftPane: {
    minWidth: DESKTOP_INBOX_MIN_WIDTH,
    maxWidth: DESKTOP_INBOX_MAX_WIDTH,
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  mobileLeftPane: {
    flex: 1,
    minHeight: 0,
  },
  desktopLeftShell: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  mobileLeftShell: {
    flex: 1,
    minHeight: 0,
  },
  desktopInboxTop: {
    marginBottom: 0,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    backgroundColor: '#F8FAFC',
  },
  desktopInboxList: {
    flex: 1,
  },
  desktopRightPane: {
    minWidth: DESKTOP_CHAT_MIN_WIDTH,
    maxWidth: DESKTOP_CHAT_MAX_WIDTH,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
  },
  desktopChatShell: {
    width: '100%',
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  desktopPlaceholderCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  desktopPlaceholderTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  desktopPlaceholderText: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 360,
  },
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
  tabCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  tabCountText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  tabBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabUnreadBadge: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
    minWidth: 34,
    paddingHorizontal: 6,
    flexDirection: 'row',
    gap: 3,
  },
  tabUnreadText: {
    color: '#FFFFFF',
  },
  listHost: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  scopeLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    zIndex: 10,
  },
  scopeLoaderText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
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
  outboxMetaPending: {
    color: '#0F766E',
  },
  outboxMetaFailed: {
    color: '#B91C1C',
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
