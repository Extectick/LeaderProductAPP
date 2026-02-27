import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import {
  assignAppeal,
  changeAppealDepartment,
  exportAppealsAnalyticsByAppeals,
  getAppealsAnalyticsAppeals,
  getAppealsKpiDashboard,
  getAppealsAnalyticsMeta,
  getAppealsAnalyticsUserAppeals,
  getAppealsAnalyticsUsers,
  getDepartmentMembers,
  setAppealsAnalyticsUserHourlyRate,
  updateAppealDeadline,
  updateAppealStatus,
  upsertAppealLabor,
} from '@/utils/appealsService';
import {
  AppealsAnalyticsAppealItem,
  AppealsKpiDashboardResponse,
  AppealsAnalyticsMeta,
  AppealsAnalyticsUsersSummaryItem,
  AppealStatus,
  UserMini,
} from '@/src/entities/appeal/types';
import { createUsersTabStyles } from '@/app/(main)/admin/tabs/usersTab.styles';
import type { AdminUsersListItem } from '@/utils/userService';
import { AnalyticsToolbar } from './components/AnalyticsToolbar';
import { AppealsTableSection } from './components/AppealsTableSection';
import { UsersAnalyticsSection } from './components/UsersAnalyticsSection';
import { AppealActionModals } from './components/AppealActionModals';
import { analyticsStyles as styles } from './styles';
import {
  APPEALS_ANALYTICS_ALL_COLUMNS,
  APPEALS_ANALYTICS_LOCKED_COLUMNS,
  type ActionKey,
  type LaborDraftState,
  type PaymentStateFilter,
  type PeriodPreset,
  type TabKey,
  type TableColumnKey,
} from './types';
import { blobToBase64, hydrateLaborDraftState, toDraftNumericString } from './helpers';

const PAGE_SIZE = 20;
const ANALYTICS_FILTERS_STORAGE_KEY = 'appeals_analytics_filters_v1';
const ANALYTICS_VISIBLE_COLUMNS_STORAGE_KEY = 'appeals_analytics_visible_columns_v1';

type StoredAnalyticsFilters = {
  periodPreset: PeriodPreset;
  customFromDate: string | null;
  customToDate: string | null;
  departmentId: number | null;
  assigneeUserId: number | null;
  status: AppealStatus | null;
  paymentState: PaymentStateFilter | null;
  searchInput: string;
};

function sanitizeVisibleColumns(raw: unknown): TableColumnKey[] {
  const allowed = new Set<TableColumnKey>(APPEALS_ANALYTICS_ALL_COLUMNS);
  const locked = new Set<TableColumnKey>(APPEALS_ANALYTICS_LOCKED_COLUMNS);
  const parsedList = Array.isArray(raw) ? raw : [];
  const selected = new Set<TableColumnKey>();
  for (const item of parsedList) {
    if (typeof item !== 'string') continue;
    const key = item as TableColumnKey;
    if (allowed.has(key)) selected.add(key);
  }
  for (const key of locked) selected.add(key);
  if (!selected.size) return [...APPEALS_ANALYTICS_ALL_COLUMNS];
  return APPEALS_ANALYTICS_ALL_COLUMNS.filter((key) => selected.has(key));
}

export default function AppealsAnalyticsScreen() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const isMobileWeb = Platform.OS === 'web' && viewportWidth < 920;
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });
  const tabBarSpacerHeight = useTabBarSpacerHeight();

  const [tab, setTab] = useState<TabKey>('appeals');
  const [meta, setMeta] = useState<AppealsAnalyticsMeta | null>(null);

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [customFromDate, setCustomFromDate] = useState<string | undefined>(undefined);
  const [customToDate, setCustomToDate] = useState<string | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<number | undefined>(undefined);
  const [assigneeUserId, setAssigneeUserId] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<AppealStatus | undefined>(undefined);
  const [paymentState, setPaymentState] = useState<PaymentStateFilter | undefined>(undefined);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<TableColumnKey[]>([...APPEALS_ANALYTICS_ALL_COLUMNS]);
  const [columnsHydrated, setColumnsHydrated] = useState(false);

  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [periodDraftFrom, setPeriodDraftFrom] = useState<string | undefined>(undefined);
  const [periodDraftTo, setPeriodDraftTo] = useState<string | undefined>(undefined);

  const [appeals, setAppeals] = useState<AppealsAnalyticsAppealItem[]>([]);
  const [appealsHasMore, setAppealsHasMore] = useState(true);
  const [appealsTotal, setAppealsTotal] = useState(0);
  const [initialLoadingAppeals, setInitialLoadingAppeals] = useState(true);
  const [refreshLoadingAppeals, setRefreshLoadingAppeals] = useState(false);
  const [loadingMoreAppeals, setLoadingMoreAppeals] = useState(false);

  const [kpiDashboard, setKpiDashboard] = useState<AppealsKpiDashboardResponse | null>(null);
  const [loadingKpi, setLoadingKpi] = useState(false);
  const [kpiModalVisible, setKpiModalVisible] = useState(false);

  const [users, setUsers] = useState<AppealsAnalyticsUsersSummaryItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserAppeals, setSelectedUserAppeals] = useState<AppealsAnalyticsAppealItem[]>([]);
  const [loadingSelectedUserAppeals, setLoadingSelectedUserAppeals] = useState(false);

  const [laborDraft, setLaborDraft] = useState<LaborDraftState>({});
  const [menuAppealId, setMenuAppealId] = useState<number | null>(null);
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState<string | null>(null);
  const [assignMembers, setAssignMembers] = useState<UserMini[]>([]);
  const [assignSelectedIds, setAssignSelectedIds] = useState<number[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [transferDepartmentId, setTransferDepartmentId] = useState<number | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  const offsetRef = useRef(0);
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const appealsCountRef = useRef(0);
  const hasStoredFiltersRef = useRef(false);

  useEffect(() => {
    appealsCountRef.current = appeals.length;
  }, [appeals.length]);

  useEffect(() => {
    let mounted = true;
    const restoreFilters = async () => {
      try {
        const raw = await AsyncStorage.getItem(ANALYTICS_FILTERS_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<StoredAnalyticsFilters>;
        hasStoredFiltersRef.current = true;
        if (!mounted) return;

        const allowedPeriodPresets: PeriodPreset[] = ['all', '7', '30', '90', 'custom'];
        const nextPeriod =
          parsed.periodPreset && allowedPeriodPresets.includes(parsed.periodPreset)
            ? parsed.periodPreset
            : 'all';
        setPeriodPreset(nextPeriod);
        setCustomFromDate(parsed.customFromDate ?? undefined);
        setCustomToDate(parsed.customToDate ?? undefined);
        setDepartmentId(typeof parsed.departmentId === 'number' ? parsed.departmentId : undefined);
        setAssigneeUserId(typeof parsed.assigneeUserId === 'number' ? parsed.assigneeUserId : undefined);
        setStatus((parsed.status as AppealStatus | null | undefined) ?? undefined);
        setPaymentState((parsed.paymentState as PaymentStateFilter | null | undefined) ?? undefined);
        const restoredSearch = String(parsed.searchInput || '');
        setSearchInput(restoredSearch);
        setSearch(restoredSearch.trim());
      } catch {
        hasStoredFiltersRef.current = false;
      } finally {
        if (mounted) setFiltersHydrated(true);
      }
    };
    void restoreFilters();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const restoreVisibleColumns = async () => {
      try {
        const raw = await AsyncStorage.getItem(ANALYTICS_VISIBLE_COLUMNS_STORAGE_KEY);
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw) as unknown;
        setVisibleColumns(sanitizeVisibleColumns(parsed));
      } catch {
        if (mounted) {
          setVisibleColumns([...APPEALS_ANALYTICS_ALL_COLUMNS]);
        }
      } finally {
        if (mounted) {
          setColumnsHydrated(true);
        }
      }
    };
    void restoreVisibleColumns();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const hasActiveFilters = useMemo(
    () =>
      periodPreset !== 'all' ||
      Boolean(customFromDate) ||
      Boolean(customToDate) ||
      departmentId != null ||
      assigneeUserId != null ||
      status != null ||
      paymentState != null ||
      searchInput.trim().length > 0,
    [assigneeUserId, customFromDate, customToDate, departmentId, paymentState, periodPreset, searchInput, status]
  );

  useEffect(() => {
    if (!filtersHydrated) return;
    const payload: StoredAnalyticsFilters = {
      periodPreset,
      customFromDate: customFromDate ?? null,
      customToDate: customToDate ?? null,
      departmentId: departmentId ?? null,
      assigneeUserId: assigneeUserId ?? null,
      status: status ?? null,
      paymentState: paymentState ?? null,
      searchInput,
    };

    if (!hasActiveFilters) {
      void AsyncStorage.removeItem(ANALYTICS_FILTERS_STORAGE_KEY);
      return;
    }
    void AsyncStorage.setItem(ANALYTICS_FILTERS_STORAGE_KEY, JSON.stringify(payload));
  }, [
    assigneeUserId,
    customFromDate,
    customToDate,
    departmentId,
    filtersHydrated,
    hasActiveFilters,
    periodPreset,
    paymentState,
    searchInput,
    status,
  ]);

  useEffect(() => {
    if (!columnsHydrated) return;
    void AsyncStorage.setItem(
      ANALYTICS_VISIBLE_COLUMNS_STORAGE_KEY,
      JSON.stringify(sanitizeVisibleColumns(visibleColumns))
    );
  }, [columnsHydrated, visibleColumns]);

  const periodRange = useMemo(() => {
    if (periodPreset === 'all') {
      return {
        fromDate: undefined as string | undefined,
        toDate: undefined as string | undefined,
        label: 'Весь период',
      };
    }
    if (periodPreset === 'custom') {
      const label = customFromDate || customToDate ? 'Кастомный период' : 'Период: от/до';
      return { fromDate: customFromDate, toDate: customToDate, label };
    }
    const days = Number(periodPreset);
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return { fromDate: from.toISOString(), toDate: to.toISOString(), label: `Последние ${days} дн.` };
  }, [customFromDate, customToDate, periodPreset]);

  const query = useMemo(
    () => ({
      fromDate: periodRange.fromDate,
      toDate: periodRange.toDate,
      departmentId,
      assigneeUserId,
      status,
      paymentState,
      search: search || undefined,
    }),
    [assigneeUserId, departmentId, paymentState, periodRange.fromDate, periodRange.toDate, search, status]
  );
  const queryKey = useMemo(() => JSON.stringify(query), [query]);

  const usersCardStyles = useMemo(
    () =>
      createUsersTabStyles({
        inputBorder: '#E2E8F0',
        cardBackground: '#FFFFFF',
        secondaryText: '#64748B',
        inputBackground: '#F8FAFC',
        text: '#0F172A',
        tint: '#2563EB',
        background: '#FFFFFF',
      }),
    []
  );

  const hydrateLaborDraft = useCallback((items: AppealsAnalyticsAppealItem[]) => {
    setLaborDraft((prev) => hydrateLaborDraftState(prev, items));
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const data = await getAppealsAnalyticsMeta();
      setMeta(data);
      if (data.role.isDepartmentManager && !data.role.isAdmin && data.availableDepartments.length > 0) {
        setDepartmentId((prev) => {
          if (prev != null) return prev;
          if (hasStoredFiltersRef.current) return prev;
          return data.availableDepartments[0].id;
        });
      }
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось загрузить метаданные аналитики');
    }
  }, []);

  const loadAppeals = useCallback(
    async (reset = false) => {
      if (!reset && (loadingRef.current || !hasMoreRef.current)) return;
      loadingRef.current = true;
      const requestId = ++requestIdRef.current;

      if (reset) {
        hasMoreRef.current = true;
        setAppealsHasMore(true);
        setInitialLoadingAppeals(appealsCountRef.current === 0);
        setRefreshLoadingAppeals(appealsCountRef.current > 0);
      } else {
        setLoadingMoreAppeals(true);
      }

      try {
        const offset = reset ? 0 : offsetRef.current;
        const res = await getAppealsAnalyticsAppeals({
          ...query,
          limit: PAGE_SIZE,
          offset,
        });
        if (requestId !== requestIdRef.current) return;

        setAppeals((prev) => (reset ? res.data : [...prev, ...res.data]));
        hydrateLaborDraft(res.data || []);
        offsetRef.current = offset + res.data.length;
        hasMoreRef.current = res.meta.hasMore;
        setAppealsHasMore(res.meta.hasMore);
        setAppealsTotal(res.meta.total);
      } catch (error: any) {
        if (requestId === requestIdRef.current) {
          Alert.alert('Ошибка', error?.message || 'Не удалось загрузить список обращений');
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setInitialLoadingAppeals(false);
          setRefreshLoadingAppeals(false);
          setLoadingMoreAppeals(false);
        }
        loadingRef.current = false;
      }
    },
    [hydrateLaborDraft, query]
  );

  const loadKpi = useCallback(async () => {
    setLoadingKpi(true);
    try {
      const data = await getAppealsKpiDashboard({
        fromDate: periodRange.fromDate,
        toDate: periodRange.toDate,
        departmentId,
        assigneeUserId,
        status,
        paymentState,
        search: search || undefined,
      });
      setKpiDashboard(data);
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось загрузить KPI');
    } finally {
      setLoadingKpi(false);
    }
  }, [assigneeUserId, departmentId, paymentState, periodRange.fromDate, periodRange.toDate, search, status]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await getAppealsAnalyticsUsers({
        fromDate: periodRange.fromDate,
        toDate: periodRange.toDate,
        departmentId,
      });
      setUsers(res.data || []);
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось загрузить список исполнителей');
    } finally {
      setLoadingUsers(false);
    }
  }, [departmentId, periodRange.fromDate, periodRange.toDate]);

  const loadSelectedUserAppeals = useCallback(
    async (userId: number) => {
      setSelectedUserId(userId);
      setLoadingSelectedUserAppeals(true);
      try {
        const res = await getAppealsAnalyticsUserAppeals({
          userId,
          fromDate: periodRange.fromDate,
          toDate: periodRange.toDate,
          departmentId,
        });
        setSelectedUserAppeals(res.data || []);
      } catch (error: any) {
        Alert.alert('Ошибка', error?.message || 'Не удалось загрузить обращения исполнителя');
      } finally {
        setLoadingSelectedUserAppeals(false);
      }
    },
    [departmentId, periodRange.fromDate, periodRange.toDate]
  );

  useEffect(() => {
    if (!filtersHydrated) return;
    void loadMeta();
  }, [filtersHydrated, loadMeta]);

  useEffect(() => {
    if (!filtersHydrated) return;
    if (tab !== 'appeals') return;
    offsetRef.current = 0;
    hasMoreRef.current = true;
    setAppealsHasMore(true);
    void loadAppeals(true);
    void loadKpi();
  }, [filtersHydrated, loadAppeals, loadKpi, queryKey, tab]);

  useEffect(() => {
    if (!filtersHydrated) return;
    if (tab !== 'users') return;
    void loadUsers();
    if (selectedUserId != null) {
      void loadSelectedUserAppeals(selectedUserId);
    }
  }, [
    departmentId,
    filtersHydrated,
    loadSelectedUserAppeals,
    loadUsers,
    periodRange.fromDate,
    periodRange.toDate,
    selectedUserId,
    tab,
  ]);

  useEffect(() => {
    if (tab !== 'appeals' && kpiModalVisible) {
      setKpiModalVisible(false);
    }
  }, [kpiModalVisible, tab]);

  const resetFilters = useCallback(() => {
    setPeriodPreset('all');
    setCustomFromDate(undefined);
    setCustomToDate(undefined);
    setDepartmentId(undefined);
    setAssigneeUserId(undefined);
    setStatus(undefined);
    setPaymentState(undefined);
    setSearchInput('');
    setSearch('');
  }, []);

  const usersAsAdminItems = useMemo<AdminUsersListItem[]>(
    () =>
      (users || []).map((row) => ({
        id: row.user.id,
        email: row.user.email || '',
        firstName: row.user.firstName || null,
        lastName: row.user.lastName || null,
        middleName: null,
        phone: null,
        avatarUrl: row.user.avatarUrl || null,
        departmentName: row.user.department?.name || null,
        role: { id: 0, name: 'employee', displayName: 'Сотрудник' },
        lastSeenAt: null,
        isOnline: false,
        moderationState: 'EMPLOYEE_ACTIVE',
        channels: { push: false, telegram: false, max: false },
        createdAt: null,
        departmentId: row.user.department?.id ?? null,
        employeeStatus: 'ACTIVE',
      })),
    [users]
  );

  const appealById = useMemo(() => {
    const map = new Map<number, AppealsAnalyticsAppealItem>();
    (appeals || []).forEach((row) => map.set(row.id, row));
    return map;
  }, [appeals]);
  const selectedAppeal = menuAppealId ? appealById.get(menuAppealId) || null : null;

  const refreshAppealsSoft = useCallback(async () => {
    offsetRef.current = 0;
    hasMoreRef.current = true;
    setAppealsHasMore(true);
    await loadAppeals(true);
  }, [loadAppeals]);

  const resetLaborDraftForAppeal = useCallback((appeal: AppealsAnalyticsAppealItem | null) => {
    if (!appeal) return;
    setLaborDraft((prev) => {
      const next = { ...prev };
      const appealDraft: LaborDraftState[number] = {};
      for (const assignee of appeal.assignees || []) {
        const existing = (appeal.laborEntries || []).find((entry) => entry.assigneeUserId === assignee.id);
        appealDraft[assignee.id] = {
          accruedHours: toDraftNumericString(existing?.accruedHours),
          paidHours: toDraftNumericString(existing?.paidHours),
          paymentStatus: existing?.paymentStatus,
        };
      }
      next[appeal.id] = appealDraft;
      return next;
    });
  }, []);

  const saveUserHourlyRate = useCallback(
    async (userId: number, hourlyRateRub: number) => {
      await setAppealsAnalyticsUserHourlyRate(userId, hourlyRateRub);
      await loadUsers();
      if (selectedUserId === userId) {
        await loadSelectedUserAppeals(userId);
      }
      if (tab === 'appeals') {
        await refreshAppealsSoft();
        await loadKpi();
      }
    },
    [loadKpi, loadSelectedUserAppeals, loadUsers, refreshAppealsSoft, selectedUserId, tab]
  );

  const openAction = useCallback(
    async (action: ActionKey) => {
      if (!selectedAppeal) return;
      setActiveAction(action);
      if (action === 'deadline') {
        setDeadlineDraft(selectedAppeal.deadline || null);
      }
      if (action === 'assign') {
        setAssignLoading(true);
        setAssignSelectedIds((selectedAppeal.assignees || []).map((a) => a.id));
        try {
          const members = await getDepartmentMembers(selectedAppeal.toDepartment.id);
          setAssignMembers(members || []);
        } catch (error: any) {
          Alert.alert('Ошибка', error?.message || 'Не удалось загрузить сотрудников отдела');
        } finally {
          setAssignLoading(false);
        }
      }
      if (action === 'transfer') {
        setTransferDepartmentId(selectedAppeal.toDepartment.id);
      }
      if (action === 'labor') {
        resetLaborDraftForAppeal(selectedAppeal);
      }
    },
    [resetLaborDraftForAppeal, selectedAppeal]
  );

  const closeActionModal = useCallback(() => {
    if (activeAction === 'labor') {
      resetLaborDraftForAppeal(selectedAppeal);
    }
    setActiveAction(null);
  }, [activeAction, resetLaborDraftForAppeal, selectedAppeal]);

  const closeActionMenu = useCallback(() => {
    setMenuAppealId(null);
    setActiveAction(null);
  }, []);

  const openAppealFromAnalytics = useCallback(
    (appealId: number) => {
      closeActionMenu();
      router.push({
        pathname: '/services/appeals/[id]',
        params: { id: String(appealId), backTo: 'analytics' },
      } as any);
    },
    [closeActionMenu, router]
  );

  const saveStatus = useCallback(
    async (nextStatus: AppealStatus) => {
      if (!selectedAppeal) return;
      setActionBusy(true);
      try {
        await updateAppealStatus(selectedAppeal.id, nextStatus);
        setAppeals((prev) =>
          prev.map((a) => (a.id === selectedAppeal.id ? { ...a, status: nextStatus } : a))
        );
        setActiveAction(null);
        await refreshAppealsSoft();
        await loadKpi();
      } catch (error: any) {
        Alert.alert('Ошибка', error?.message || 'Не удалось изменить статус');
      } finally {
        setActionBusy(false);
      }
    },
    [loadKpi, refreshAppealsSoft, selectedAppeal]
  );

  const saveDeadline = useCallback(async () => {
    if (!selectedAppeal) return;
    setActionBusy(true);
    try {
      await updateAppealDeadline(selectedAppeal.id, deadlineDraft || null);
      setAppeals((prev) =>
        prev.map((a) =>
          a.id === selectedAppeal.id ? { ...a, deadline: deadlineDraft || null } : a
        )
      );
      setActiveAction(null);
      await refreshAppealsSoft();
      await loadKpi();
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось изменить дедлайн');
    } finally {
      setActionBusy(false);
    }
  }, [deadlineDraft, loadKpi, refreshAppealsSoft, selectedAppeal]);

  const saveAssign = useCallback(async () => {
    if (!selectedAppeal) return;
    setActionBusy(true);
    try {
      await assignAppeal(selectedAppeal.id, assignSelectedIds);
      setActiveAction(null);
      await refreshAppealsSoft();
      await loadKpi();
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось назначить исполнителей');
    } finally {
      setActionBusy(false);
    }
  }, [assignSelectedIds, loadKpi, refreshAppealsSoft, selectedAppeal]);

  const saveTransfer = useCallback(async () => {
    if (!selectedAppeal || !transferDepartmentId) return;
    setActionBusy(true);
    try {
      await changeAppealDepartment(selectedAppeal.id, transferDepartmentId);
      setActiveAction(null);
      await refreshAppealsSoft();
      await loadKpi();
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось передать обращение');
    } finally {
      setActionBusy(false);
    }
  }, [loadKpi, refreshAppealsSoft, selectedAppeal, transferDepartmentId]);

  const toggleAssignMember = useCallback((userId: number) => {
    setAssignSelectedIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }, []);

  const onChangeLaborAccruedHours = useCallback((appealId: number, assigneeUserId: number, value: string) => {
    setLaborDraft((prev) => ({
      ...prev,
      [appealId]: {
        ...(prev[appealId] || {}),
        [assigneeUserId]: {
          ...(prev[appealId]?.[assigneeUserId] || { paidHours: '' }),
          accruedHours: value.replace(',', '.'),
        },
      },
    }));
  }, []);

  const onChangeLaborPaidHours = useCallback((appealId: number, assigneeUserId: number, value: string) => {
    setLaborDraft((prev) => ({
      ...prev,
      [appealId]: {
        ...(prev[appealId] || {}),
        [assigneeUserId]: {
          ...(prev[appealId]?.[assigneeUserId] || { accruedHours: '' }),
          paidHours: value.replace(',', '.'),
        },
      },
    }));
  }, []);

  const saveLabor = useCallback(async () => {
    if (!selectedAppeal) return;

    setActionBusy(true);
    try {
      const draftForAppeal = laborDraft[selectedAppeal.id] || {};
      const items = (selectedAppeal.assignees || []).map((assignee) => {
        const draft = draftForAppeal[assignee.id];
        const parsedAccrued = Number(draft?.accruedHours ?? '0');
        const parsedPaid = Number(draft?.paidHours ?? '0');
        const normalizedAccruedRaw = Number.isFinite(parsedAccrued) && parsedAccrued >= 0 ? parsedAccrued : 0;
        const normalizedPaidRaw = Number.isFinite(parsedPaid) && parsedPaid >= 0 ? parsedPaid : 0;
        const normalizedAccrued = Math.max(normalizedAccruedRaw, normalizedPaidRaw);
        const normalizedPaid = Math.min(normalizedAccrued, normalizedPaidRaw);
        return {
          assigneeUserId: assignee.id,
          accruedHours: normalizedAccrued,
          paidHours: normalizedPaid,
        };
      });
      const saved = await upsertAppealLabor(selectedAppeal.id, items);
      setAppeals((prev) =>
        prev.map((a) =>
          a.id === selectedAppeal.id
            ? {
                ...a,
                laborEntries: saved.laborEntries,
                toDepartment: { ...a.toDepartment, paymentRequired: saved.paymentRequired },
              }
            : a
        )
      );
      setLaborDraft((prev) => {
        const next = { ...prev };
        const persistedDraft: LaborDraftState[number] = {};
        for (const row of saved.laborEntries || []) {
          persistedDraft[row.assigneeUserId] = {
            accruedHours: toDraftNumericString(row.accruedHours),
            paidHours: toDraftNumericString(row.paidHours),
            paymentStatus: row.paymentStatus,
          };
        }
        next[selectedAppeal.id] = persistedDraft;
        return next;
      });
      await loadKpi();
      setActiveAction(null);
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось сохранить часы и выплаты');
    } finally {
      setActionBusy(false);
    }
  }, [laborDraft, loadKpi, selectedAppeal]);

  const exportList = useCallback(
    async (format: 'csv' | 'xlsx') => {
      if (exportBusy) return;
      setExportBusy(true);
      try {
        const blob = await exportAppealsAnalyticsByAppeals({
          fromDate: periodRange.fromDate,
          toDate: periodRange.toDate,
          departmentId,
          assigneeUserId,
          status,
          paymentState,
          search: search || undefined,
          columns: visibleColumns,
          format,
        });
        const fileName = `appeals_analytics_${Date.now()}.${format}`;
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          const url = URL.createObjectURL(blob as Blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } else {
          const base64 = await blobToBase64(blob as Blob);
          const baseDir =
            (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
          const path = `${baseDir}${fileName}`;
          await FileSystem.writeAsStringAsync(path, base64, {
            encoding: (FileSystem as any).EncodingType?.Base64 ?? 'base64',
          });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(path);
          } else {
            Alert.alert('Экспорт', `Файл сохранён: ${path}`);
          }
        }
      } catch (error: any) {
        Alert.alert('Ошибка', error?.message || 'Не удалось выполнить экспорт');
      } finally {
        setExportBusy(false);
      }
    },
    [
      assigneeUserId,
      departmentId,
      exportBusy,
      paymentState,
      periodRange.fromDate,
      periodRange.toDate,
      search,
      status,
      visibleColumns,
    ]
  );

  const handlePeriodSelect = useCallback(
    (value: PeriodPreset) => {
      if (value === 'custom') {
        setPeriodDraftFrom(customFromDate);
        setPeriodDraftTo(customToDate);
        setPeriodModalVisible(true);
        return;
      }
      setPeriodPreset(value);
    },
    [customFromDate, customToDate]
  );

  const updateVisibleColumns = useCallback((next: TableColumnKey[]) => {
    setVisibleColumns(sanitizeVisibleColumns(next));
  }, []);

  const resetVisibleColumns = useCallback(() => {
    setVisibleColumns([...APPEALS_ANALYTICS_ALL_COLUMNS]);
  }, []);

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: headerTopInset + 2, paddingHorizontal: 12, flex: 1 }}>
        <AnalyticsToolbar
          tab={tab}
          onTabChange={setTab}
          showKpiShortcut={tab === 'appeals' && isMobileWeb}
          onOpenKpiShortcut={() => setKpiModalVisible(true)}
          periodPreset={periodPreset}
          periodLabel={periodRange.label}
          onPeriodSelect={handlePeriodSelect}
          departmentId={departmentId}
          onDepartmentChange={setDepartmentId}
          assigneeUserId={assigneeUserId}
          onAssigneeChange={setAssigneeUserId}
          status={status}
          onStatusChange={setStatus}
          paymentState={paymentState}
          onPaymentStateChange={setPaymentState}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          canResetFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          exportBusy={exportBusy}
          onExport={(format) => {
            void exportList(format);
          }}
          meta={meta}
          appealsTotal={appealsTotal}
          usersTotal={users.length}
        />

        {tab === 'appeals' ? (
          <AppealsTableSection
            appeals={appeals}
            initialLoading={initialLoadingAppeals}
            refreshLoading={refreshLoadingAppeals}
            loadingMore={loadingMoreAppeals}
            hasMore={appealsHasMore}
            kpiDashboard={kpiDashboard}
            loadingKpi={loadingKpi}
            kpiModalVisible={kpiModalVisible}
            onCloseKpiModal={() => setKpiModalVisible(false)}
            onRefresh={() => {
              void loadAppeals(true);
            }}
            onLoadMore={() => {
              void loadAppeals(false);
            }}
            onOpenActions={setMenuAppealId}
            visibleColumns={visibleColumns}
            onChangeVisibleColumns={updateVisibleColumns}
            onResetVisibleColumns={resetVisibleColumns}
          />
        ) : (
          <UsersAnalyticsSection
            usersAsAdminItems={usersAsAdminItems}
            users={users}
            selectedUserId={selectedUserId}
            selectedUserAppeals={selectedUserAppeals}
            loadingUsers={loadingUsers}
            loadingSelectedUserAppeals={loadingSelectedUserAppeals}
            usersCardStyles={usersCardStyles}
            meta={meta}
            onSelectUser={(userId) => {
              void loadSelectedUserAppeals(userId);
            }}
            onSaveHourlyRate={async (userId, hourlyRateRub) => {
              await saveUserHourlyRate(userId, hourlyRateRub);
            }}
            onRefresh={() => {
              void loadUsers();
            }}
          />
        )}
      </View>

      <View style={{ height: Platform.OS === 'web' ? 0 : tabBarSpacerHeight }} />

      <AppealActionModals
        selectedAppeal={selectedAppeal}
        periodModalVisible={periodModalVisible}
        onClosePeriodModal={() => setPeriodModalVisible(false)}
        periodDraftFrom={periodDraftFrom}
        periodDraftTo={periodDraftTo}
        onChangePeriodDraftFrom={setPeriodDraftFrom}
        onChangePeriodDraftTo={setPeriodDraftTo}
        onApplyPeriodDraft={() => {
          setCustomFromDate(periodDraftFrom);
          setCustomToDate(periodDraftTo);
          setPeriodPreset('custom');
          setPeriodModalVisible(false);
        }}
        activeAction={activeAction}
        onOpenAction={(action) => {
          void openAction(action);
        }}
        onOpenAppeal={openAppealFromAnalytics}
        onCloseActionMenu={closeActionMenu}
        onCloseActionModal={closeActionModal}
        actionBusy={actionBusy}
        deadlineDraft={deadlineDraft}
        onChangeDeadlineDraft={setDeadlineDraft}
        onSaveStatus={(nextStatus) => {
          void saveStatus(nextStatus);
        }}
        onSaveDeadline={() => {
          void saveDeadline();
        }}
        assignMembers={assignMembers}
        assignSelectedIds={assignSelectedIds}
        assignLoading={assignLoading}
        onToggleAssignMember={toggleAssignMember}
        onSaveAssign={() => {
          void saveAssign();
        }}
        meta={meta}
        transferDepartmentId={transferDepartmentId}
        onChangeTransferDepartmentId={setTransferDepartmentId}
        onSaveTransfer={() => {
          void saveTransfer();
        }}
        laborDraft={laborDraft}
        onChangeLaborAccruedHours={onChangeLaborAccruedHours}
        onChangeLaborPaidHours={onChangeLaborPaidHours}
        onSaveLabor={() => {
          void saveLabor();
        }}
      />
    </View>
  );
}
