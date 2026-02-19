// components/Appeals/AppealDetailContent.tsx
import { useEffect, useState, useCallback, useContext, useRef, useMemo } from 'react';
import {
  Alert,
  Platform,
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Image,
  Keyboard,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import {
  getAppealById,
  getAppealMessagesBootstrap,
  getAppealMessagesPage,
  updateAppealStatus,
  updateAppealDeadline,
  assignAppeal,
  claimAppeal,
  changeAppealDepartment,
  getDepartmentMembers,
} from '@/utils/appealsService';
import { AppealDetail, AppealStatus, AppealMessage, UserMini } from '@/src/entities/appeal/types';
import AppealHeader from '@/components/Appeals/AppealHeader'; // <-- исправлено имя файла
import MessagesList, { MessagesListHandle } from '@/components/Appeals/MessagesList';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { AuthContext } from '@/context/AuthContext';
import {
  getMessages,
  getMessagesMeta,
  setMessages,
  prependMessages,
  removeAppeal,
  setAppeals,
  subscribe as subscribeAppeals,
} from '@/utils/appealsStore';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { Ionicons } from '@expo/vector-icons';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { getDepartments, Department } from '@/utils/userService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dismissNotificationsByKeys } from '@/utils/notificationStore';
import { dismissAppealSystemNotifications } from '@/utils/pushNotifications';
import CustomAlert from '@/components/CustomAlert';
import { useAppealMessageSend } from '@/src/features/appeals/hooks/useAppealMessageSend';
import ProfileView from '@/components/Profile/ProfileView';
import {
  cancelAppealsOutboxMessageByLocalId,
  retryAppealsOutboxMessageByLocalId,
} from '@/src/features/appeals/sync/outbox';
import { useAppealReadController } from '@/src/features/appeals/hooks/useAppealReadController';
import { useAppealRealtimeEvents } from '@/src/features/appeals/hooks/useAppealRealtimeEvents';
import AppealActionDock from '@/src/features/appeals/ui/AppealActionDock';
import { usePresence } from '@/hooks/usePresence';
import type { PresenceInfo } from '@/utils/presenceService';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import { Skeleton } from 'moti/skeleton';
import { LinearGradient } from 'expo-linear-gradient';

type DockMode = 'chat' | 'claim' | 'creator_resolved' | 'closed';
type PendingDockAction = 'claim' | 'complete' | 'reject';

type AppealDetailContentProps = {
  appealId: number;
  mode?: 'page' | 'pane';
  onClearSelection?: () => void;
};

type AppealParticipant = {
  user: UserMini;
  isCreator: boolean;
  isAssignee: boolean;
};

export default function AppealDetailContent({
  appealId,
  mode = 'page',
  onClearSelection,
}: AppealDetailContentProps) {
  const isPaneMode = mode === 'pane';
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });
  const hasValidAppealId = Number.isFinite(appealId) && appealId > 0;
  const [data, setData] = useState<AppealDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessagesState] = useState<AppealMessage[]>([]);
  const [messagesMeta, setMessagesMetaState] = useState(getMessagesMeta(appealId));
  const auth = useContext(AuthContext);
  const { isAdmin } = useIsAdmin();
  const [inputHeight, setInputHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialAnchorMessageId, setInitialAnchorMessageId] = useState<number | null>(null);
  const insets = useSafeAreaInsets();
  const contentSidePadding = isPaneMode ? 12 : Platform.OS === 'web' ? 16 : 12;
  const listRef = useRef<MessagesListHandle>(null);
  const openSessionRef = useRef(0);
  const storeSyncReadyRef = useRef(false);
  const pageSize = 30;
  const [assignVisible, setAssignVisible] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [deptMembers, setDeptMembers] = useState<UserMini[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>([]);
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [deadlineVisible, setDeadlineVisible] = useState(false);
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingDockAction, setPendingDockAction] = useState<PendingDockAction | null>(null);
  const [dockActionLoading, setDockActionLoading] = useState(false);
  const [forceChatMode, setForceChatMode] = useState(false);
  const forceChatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [peopleModalVisible, setPeopleModalVisible] = useState(false);
  const [peopleView, setPeopleView] = useState<'list' | 'profile'>('list');
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<number | null>(null);
  const [peopleSkeletonVisible, setPeopleSkeletonVisible] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const devLog = useCallback(
    (stage: string, extra?: Record<string, any>) => {
      if (!__DEV__) return;
      console.log('[appeal-open]', { appealId, stage, ...(extra || {}) });
    },
    [appealId]
  );

  const resolveLoadErrorMessage = useCallback((error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : '';
    if (/нет доступа/i.test(rawMessage) || /forbidden/i.test(rawMessage)) {
      return 'Нет доступа к этому обращению';
    }
    return 'Не удалось загрузить обращение';
  }, []);

  const isAccessDeniedError = useCallback((error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : '';
    return /нет доступа/i.test(rawMessage) || /forbidden/i.test(rawMessage);
  }, []);

  const dismissAppealNotifications = useCallback(
    (messageIds?: number[]) => {
      const keys = [`appeal:${appealId}`];
      (messageIds || []).forEach((id) => keys.push(`appeal-message:${id}`));
      dismissNotificationsByKeys(keys);
      void dismissAppealSystemNotifications({
        appealId,
        messageIds: messageIds?.length ? messageIds : undefined,
      });
    },
    [appealId]
  );

  const getErrorStatus = useCallback((error: unknown) => {
    const status = Number((error as any)?.status);
    return Number.isFinite(status) ? status : 0;
  }, []);

  const messagesById = useMemo(() => {
    const map = new Map<number, AppealMessage>();
    (messages || []).forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  const {
    initialPositionReadyRef,
    resetReadController,
    handleVisibleMessageIds,
    handleUserInteraction,
    tryArmReadsAfterInteraction,
    armReads,
    enqueueReadIds,
  } = useAppealReadController({
    appealId,
    viewerUserId: auth?.profile?.id,
    messagesById,
    isAtBottom,
    initialLoading,
    devLog,
    dismissAppealNotifications,
  });

  const load = useCallback(async (force = false, _refreshMessages = false) => {
    if (!hasValidAppealId) return;
    const sessionId = openSessionRef.current;
    try {
      const d = await getAppealById(appealId, force);
      if (sessionId !== openSessionRef.current) return;
      setLoadError(null);
      setData(d);
      await setAppeals([d as any]);
      if (!storeSyncReadyRef.current) return;
      setMessagesState(getMessages(appealId));
      setMessagesMetaState(getMessagesMeta(appealId));
    } catch (error) {
      if (sessionId !== openSessionRef.current) return;
      const denied = isAccessDeniedError(error);
      setLoadError(resolveLoadErrorMessage(error));
      // Если доступ потерян (например, после передачи в другой отдел),
      // сбрасываем текущие данные, чтобы не оставлять устаревшую карточку.
      setData(null);
      setMessagesState([]);
      setMessagesMetaState({
        hasMoreBefore: false,
        prevCursor: null,
        hasMoreAfter: false,
        nextCursor: null,
        anchorMessageId: null,
      });
      if (denied) {
        void removeAppeal(appealId);
        if (isPaneMode && onClearSelection) onClearSelection();
      }
    }
  }, [
    appealId,
    hasValidAppealId,
    isAccessDeniedError,
    isPaneMode,
    onClearSelection,
    resolveLoadErrorMessage,
  ]);

  useEffect(() => {
    if (!hasValidAppealId) {
      setData(null);
      setMessagesState([]);
      setInitialLoading(false);
      setLoadError('Некорректный идентификатор обращения');
      return;
    }
    let active = true;
    const sessionId = openSessionRef.current + 1;
    openSessionRef.current = sessionId;
    storeSyncReadyRef.current = false;
    resetReadController();

    setInitialLoading(true);
    setInitialAnchorMessageId(null);
    setLoadError(null);
    setMessagesState([]);
    setMessagesMetaState({
      hasMoreBefore: false,
      prevCursor: null,
      hasMoreAfter: false,
      nextCursor: null,
      anchorMessageId: null,
    });
    devLog('bootstrap requested');

    (async () => {
      try {
        const [d, res] = await Promise.all([
          getAppealById(appealId, false),
          getAppealMessagesBootstrap(appealId, {
            limit: pageSize,
            before: 40,
            after: 20,
            anchor: 'first_unread',
          }),
        ]);
        if (!active || sessionId !== openSessionRef.current) return;

        setData(d);
        await setAppeals([d as any]);
        await setMessages(appealId, res.data, {
          hasMoreBefore: res.meta?.hasMoreBefore ?? res.meta?.hasMore ?? false,
          prevCursor: res.meta?.prevCursor ?? res.meta?.nextCursor ?? null,
          hasMoreAfter: res.meta?.hasMoreAfter ?? false,
          nextCursor: res.meta?.nextCursor ?? null,
          anchorMessageId: res.meta?.anchorMessageId ?? null,
        });
        storeSyncReadyRef.current = true;
        setInitialAnchorMessageId(res.meta?.anchorMessageId ?? null);
        setMessagesState(getMessages(appealId));
        setMessagesMetaState(getMessagesMeta(appealId));
        devLog('bootstrap_received', {
          messagesCount: res.data?.length ?? 0,
          anchorMessageId: res.meta?.anchorMessageId ?? null,
        });
        devLog('anchor_resolved', { anchorMessageId: res.meta?.anchorMessageId ?? null });

        if ((res.data?.length ?? 0) === 0) {
          initialPositionReadyRef.current = true;
          setInitialLoading(false);
          devLog('position_ready', { reason: 'empty' });
        }
      } catch (e) {
        console.warn('Ошибка загрузки обращения:', e);
        if (!active || sessionId !== openSessionRef.current) return;
        const denied = isAccessDeniedError(e);
        setLoadError(resolveLoadErrorMessage(e));
        setData(null);
        setMessagesState([]);
        setMessagesMetaState({
          hasMoreBefore: false,
          prevCursor: null,
          hasMoreAfter: false,
          nextCursor: null,
          anchorMessageId: null,
        });
        if (denied) {
          void removeAppeal(appealId);
          if (isPaneMode && onClearSelection) onClearSelection();
        }
        setInitialLoading(false);
      }
    })();

    return () => {
      active = false;
      resetReadController();
    };
  }, [
    appealId,
    pageSize,
    devLog,
    hasValidAppealId,
    isAccessDeniedError,
    isPaneMode,
    onClearSelection,
    resetReadController,
    resolveLoadErrorMessage,
  ]);
  useEffect(() => {
    dismissAppealNotifications();
  }, [dismissAppealNotifications]);

  // подписка на локальный стор сообщений/апеллов
  useEffect(() => {
    const unsub = subscribeAppeals(() => {
      if (!storeSyncReadyRef.current) return;
      setMessagesState(getMessages(appealId));
      setMessagesMetaState(getMessagesMeta(appealId));
    });
    return () => unsub();
  }, [appealId]);

  useAppealRealtimeEvents({
    appealId,
    enabled: hasValidAppealId,
    profile: auth?.profile,
    data,
    setData,
    load,
    isAtBottom,
    initialPositionReadyRef,
    armReads,
    enqueueReadIds,
  });

  const userId = Number(auth?.profile?.id);
  const toDepartmentId = Number(data?.toDepartment?.id ?? 0);
  const employeeDepartmentId = Number(auth?.profile?.employeeProfile?.department?.id ?? 0);
  const toDepartmentName = String(data?.toDepartment?.name || '').trim().toLowerCase();

  const normalizeRoleValue = useCallback((value: unknown) => {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
  }, []);

  const isDepartmentManagerRole = useCallback(
    (dr: any) => {
      const roleName = normalizeRoleValue(dr?.role?.name);
      const roleDisplayName = normalizeRoleValue(dr?.role?.displayName);
      return (
        roleName === 'departmentmanager' ||
        roleName === 'headofdepartment' ||
        roleDisplayName === 'руководительотдела'
      );
    },
    [normalizeRoleValue]
  );

  const hasGlobalDepartmentManagerRole = useMemo(() => {
    const roleName = normalizeRoleValue(auth?.profile?.role?.name);
    const roleDisplayName = normalizeRoleValue(auth?.profile?.role?.displayName);
    return (
      roleName === 'departmentmanager' ||
      roleName === 'headofdepartment' ||
      roleDisplayName === 'руководительотдела'
    );
  }, [auth?.profile?.role?.displayName, auth?.profile?.role?.name, normalizeRoleValue]);

  const hasDepartmentManagerRoleForAppeal = useMemo(() => {
    if (!toDepartmentId) return false;
    const roles = (auth?.profile?.departmentRoles || []) as Array<any>;
    return roles.some((dr) => {
      if (!isDepartmentManagerRole(dr)) return false;
      const roleDepartmentId = Number(dr?.department?.id ?? dr?.departmentId ?? 0);
      if (roleDepartmentId > 0) return roleDepartmentId === toDepartmentId;
      const roleDepartmentName = String(dr?.department?.name || '').trim().toLowerCase();
      if (roleDepartmentName && toDepartmentName) return roleDepartmentName === toDepartmentName;
      // fallback для профилей, где dept-role приходит без department в объекте
      return employeeDepartmentId > 0 && employeeDepartmentId === toDepartmentId;
    });
  }, [
    auth?.profile?.departmentRoles,
    employeeDepartmentId,
    isDepartmentManagerRole,
    toDepartmentId,
    toDepartmentName,
  ]);

  const deptIds = useMemo(() => {
    const ids = new Set<number>();
    ((auth?.profile?.departmentRoles || []) as Array<any>).forEach((dr) => {
      const roleDeptId = Number(dr?.department?.id ?? dr?.departmentId ?? 0);
      if (roleDeptId > 0) ids.add(roleDeptId);
    });
    if (employeeDepartmentId > 0) {
      ids.add(employeeDepartmentId);
    }
    return ids;
  }, [auth?.profile?.departmentRoles, employeeDepartmentId]);

  const creatorId = Number((data as any)?.createdBy?.id ?? (data as any)?.createdById);
  const isCreator =
    !!data &&
    Number.isFinite(userId) &&
    userId > 0 &&
    Number.isFinite(creatorId) &&
    creatorId > 0 &&
    userId === creatorId;
  const isAssignee =
    !!data &&
    Number.isFinite(userId) &&
    userId > 0 &&
    (data.assignees || []).some((a) => Number(a.user?.id) === userId);
  const isClosedStatus = !!data && (data.status === 'COMPLETED' || data.status === 'DECLINED');
  const hasAnyDepartmentManagerRole = useMemo(() => {
    const roles = (auth?.profile?.departmentRoles || []) as Array<any>;
    return hasGlobalDepartmentManagerRole || roles.some((dr) => isDepartmentManagerRole(dr));
  }, [auth?.profile?.departmentRoles, hasGlobalDepartmentManagerRole, isDepartmentManagerRole]);
  const isDeptManager =
    !!toDepartmentId &&
    (hasDepartmentManagerRoleForAppeal ||
      (hasAnyDepartmentManagerRole && employeeDepartmentId > 0 && employeeDepartmentId === toDepartmentId));
  const isDeptMember = !!toDepartmentId && deptIds.has(toDepartmentId);

  const canAssign = !!data && (isAdmin || isDeptManager);
  const canTransfer = !!data && (isAdmin || isDeptManager);
  const canClaim =
    !!data &&
    !isClosedStatus &&
    !isAssignee &&
    !isCreator &&
    isDeptMember;
  const canEditDeadline = !!data && (isCreator || isAdmin);
  const { onSend: sendAppealMessage } = useAppealMessageSend({
    appealId,
    profile: auth?.profile,
  });

  const handleRetryLocalMessage = useCallback(async (message: AppealMessage) => {
    if (!message || message.id >= 0) return;
    await retryAppealsOutboxMessageByLocalId(appealId, message.id);
  }, [appealId]);

  const handleCancelLocalMessage = useCallback((message: AppealMessage) => {
    if (!message || message.id >= 0) return;
    Alert.alert(
      'Удалить сообщение?',
      'Сообщение будет удалено из очереди отправки.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            void cancelAppealsOutboxMessageByLocalId(appealId, message.id);
          },
        },
      ]
    );
  }, [appealId]);

  const allowedStatuses = useMemo(() => {
    if (!data) return [] as AppealStatus[];
    const set = new Set<AppealStatus>();
    if (isAdmin || isDeptManager) {
      set.add('OPEN');
      set.add('IN_PROGRESS');
      set.add('RESOLVED');
      set.add('COMPLETED');
      set.add('DECLINED');
    }
    if (isCreator) {
      set.add('COMPLETED');
      if (data.status === 'RESOLVED') set.add('IN_PROGRESS');
    }
    if (isAssignee) {
      set.add('RESOLVED');
    }
    return Array.from(set);
  }, [data, isAdmin, isDeptManager, isCreator, isAssignee]);

  async function handleChangeStatus(next: AppealStatus): Promise<boolean> {
    if (!data || next === data.status) return false;
    try {
      setData(prev => (prev ? { ...prev, status: next } : prev));
      await updateAppealStatus(appealId, next);
      await load(true, false);
      return true;
    } catch (e) {
      await load(true, false);
      console.warn('Ошибка смены статуса:', e);
      return false;
    }
  }

  async function loadMembers() {
    if (!data?.toDepartment?.id) return;
    setAssignLoading(true);
    try {
      const members = await getDepartmentMembers(data.toDepartment.id);
      setDeptMembers(members);
    } catch (e) {
      console.warn('Ошибка загрузки сотрудников отдела:', e);
    } finally {
      setAssignLoading(false);
    }
  }

  function openAssignModal() {
    const current = (data?.assignees || []).map((a) => a.user?.id).filter(Boolean) as number[];
    setSelectedAssignees(current);
    setAssignVisible(true);
    void loadMembers();
  }

  const closeAssignModal = useCallback(() => {
    if (assignLoading) return;
    setAssignVisible(false);
  }, [assignLoading]);

  const closeDeadlineModal = useCallback(() => {
    if (deadlineSaving) return;
    setDeadlineVisible(false);
  }, [deadlineSaving]);

  const closeTransferModal = useCallback(() => {
    if (transferLoading) return;
    setTransferVisible(false);
  }, [transferLoading]);

  function toggleAssignee(id: number) {
    setSelectedAssignees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSaveAssignees() {
    if (!data) return;
    setAssignLoading(true);
    try {
      await assignAppeal(appealId, selectedAssignees);
      await load(true, false);
      setAssignVisible(false);
    } catch (e) {
      const status = getErrorStatus(e);
      if (status === 403) {
        Alert.alert(
          'Недостаточно прав',
          (e as Error)?.message || 'У вас нет прав на назначение исполнителей для этого обращения.'
        );
      } else {
        Alert.alert('Ошибка', (e as Error)?.message || 'Не удалось назначить исполнителей.');
      }
      console.warn('Ошибка назначения исполнителей:', e);
    } finally {
      setAssignLoading(false);
    }
  }

  async function openTransferModal() {
    setTransferVisible(true);
    setSelectedDepartmentId(data?.toDepartment?.id ?? null);
    if (departments.length === 0) {
      setDepartmentsLoading(true);
      try {
        const list = await getDepartments();
        setDepartments(list);
      } catch (e) {
        console.warn('Ошибка загрузки отделов:', e);
      } finally {
        setDepartmentsLoading(false);
      }
    }
  }

  async function handleTransferDepartment() {
    if (!data || !selectedDepartmentId) return;
    setTransferLoading(true);
    try {
      await changeAppealDepartment(appealId, selectedDepartmentId);
      await load(true, false);
      setTransferVisible(false);
    } catch (e) {
      const status = getErrorStatus(e);
      if (status === 403) {
        Alert.alert(
          'Недостаточно прав',
          (e as Error)?.message || 'У вас нет прав на передачу обращения в другой отдел.'
        );
      } else {
        Alert.alert('Ошибка', (e as Error)?.message || 'Не удалось сменить отдел обращения.');
      }
      console.warn('Ошибка смены отдела:', e);
    } finally {
      setTransferLoading(false);
    }
  }

  async function handleClaim(): Promise<boolean> {
    if (!data) return false;
    const currentUser = auth?.profile;
    const currentUserId = currentUser?.id;
    const fallbackAssignee =
      currentUserId
        ? {
            user: {
              id: currentUserId,
              email: currentUser?.email || '',
              firstName: currentUser?.firstName || undefined,
              lastName: currentUser?.lastName || undefined,
              avatarUrl:
                currentUser?.avatarUrl ||
                currentUser?.employeeProfile?.avatarUrl ||
                currentUser?.clientProfile?.avatarUrl ||
                currentUser?.supplierProfile?.avatarUrl ||
                null,
              department: currentUser?.employeeProfile?.department || null,
              isAdmin: currentUser?.role?.name === 'admin',
              isDepartmentManager: (currentUser?.departmentRoles || []).some(
                (dr) => dr.role?.name === 'department_manager'
              ),
            },
          }
        : null;

    // Мгновенно переводим UI в состояние "в работе", чтобы кнопка claim не возвращалась.
    setData((prev) => {
      if (!prev) return prev;
      const alreadyAssigned =
        !!currentUserId &&
        (prev.assignees || []).some((a) => a.user?.id === currentUserId);
      const nextAssignees =
        !alreadyAssigned && fallbackAssignee ? [...(prev.assignees || []), fallbackAssignee] : prev.assignees;
      return {
        ...prev,
        status: prev.status === 'IN_PROGRESS' ? prev.status : 'IN_PROGRESS',
        assignees: nextAssignees,
      };
    });

    try {
      const result = await claimAppeal(appealId);
      setData((prev) => {
        if (!prev) return prev;
        const assigneeIdSet = new Set<number>(result.assigneeIds || []);
        const existingById = new Map<number, { user: UserMini }>();
        (prev.assignees || []).forEach((a) => {
          if (a.user?.id) existingById.set(a.user.id, { user: a.user });
        });
        const mergedAssignees = Array.from(assigneeIdSet).map((id) => {
          const existing = existingById.get(id);
          if (existing) return existing;
          if (fallbackAssignee?.user?.id === id) return fallbackAssignee;
          return { user: { id, email: '' } };
        });
        return {
          ...prev,
          status: result.status || prev.status,
          assignees: mergedAssignees,
        };
      });
      await load(true, false);
      return true;
    } catch (e) {
      await load(true, false);
      console.warn('Ошибка взятия обращения в работу:', e);
      return false;
    }
  }

  function openDeadlineModal() {
    setDeadlineDraft(data?.deadline ?? null);
    setDeadlineVisible(true);
  }

  async function handleSaveDeadline() {
    if (!data || deadlineSaving) return;
    setDeadlineSaving(true);
    try {
      await updateAppealDeadline(appealId, deadlineDraft);
      await load(true, false);
      setDeadlineVisible(false);
    } catch (e: any) {
      console.warn('Ошибка обновления дедлайна:', e);
    } finally {
      setDeadlineSaving(false);
    }
  }

  const loadOlder = useCallback(async () => {
    if (isLoadingMore || !messagesMeta?.hasMoreBefore) return;
    if (!messagesMeta?.prevCursor) return;
    setIsLoadingMore(true);
    try {
      const res = await getAppealMessagesPage(appealId, {
        limit: pageSize,
        cursor: messagesMeta?.prevCursor ?? undefined,
        direction: 'before',
      });
      await prependMessages(appealId, res.data, {
        hasMoreBefore: res.meta?.hasMoreBefore ?? res.meta?.hasMore ?? false,
        prevCursor: res.meta?.prevCursor ?? res.meta?.nextCursor ?? null,
        hasMoreAfter: res.meta?.hasMoreAfter ?? messagesMeta?.hasMoreAfter ?? false,
        nextCursor: res.meta?.nextCursor ?? messagesMeta?.nextCursor ?? null,
        anchorMessageId: messagesMeta?.anchorMessageId ?? null,
      });
    } catch (e) {
      console.warn('Ошибка загрузки сообщений:', e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [appealId, isLoadingMore, messagesMeta?.hasMoreBefore, messagesMeta?.prevCursor, messagesMeta?.hasMoreAfter, messagesMeta?.nextCursor, messagesMeta?.anchorMessageId, pageSize]);

  const handleInitialPositioned = useCallback(() => {
    initialPositionReadyRef.current = true;
    setInitialLoading(false);
    devLog('position_ready', { anchorMessageId: initialAnchorMessageId ?? null });
    tryArmReadsAfterInteraction();
  }, [devLog, initialAnchorMessageId, tryArmReadsAfterInteraction]);

  const inputBottomMargin = 12;
  const baseBottomInset = inputBottomMargin + Math.max(insets.bottom, 0);
  const keyboardVisible = keyboardHeight > 0;
  const adjustedKeyboardHeight =
    Platform.OS === 'ios'
      ? Math.max(keyboardHeight - insets.bottom, 0)
      : Math.max(keyboardHeight, 0);
  const keyboardGap = keyboardVisible ? 6 : 0;
  const dockBottom = keyboardVisible ? adjustedKeyboardHeight + keyboardGap : baseBottomInset;
  const listBottomInset = inputHeight + dockBottom + 2;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      const windowHeight = Dimensions.get('window').height;
      const rawHeight = e.endCoordinates?.height ?? 0;
      const screenY = e.endCoordinates?.screenY ?? 0;
      const derivedHeight = Math.max(0, windowHeight - screenY);
      setKeyboardHeight(Math.max(rawHeight, derivedHeight));
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const canRenderActions = !!data;
  const isAppealClosed = !!data && (data.status === 'COMPLETED' || data.status === 'DECLINED');
  const isCreatorResolved = !!data && isCreator && data.status === 'RESOLVED';
  const canAssignInClaimMode = !!data && isDeptManager && canAssign && canClaim;
  const computedDockMode: DockMode =
    isAppealClosed ? 'closed' : isCreatorResolved ? 'creator_resolved' : canClaim ? 'claim' : 'chat';
  const dockMode: DockMode = canRenderActions && forceChatMode && !isAppealClosed ? 'chat' : computedDockMode;

  const mapParticipantUserRole = useCallback(
    (user: UserMini): UserMini => {
      const currentProfileId = Number(auth?.profile?.id ?? 0);
      if (!currentProfileId || user.id !== currentProfileId) return user;
      return {
        ...user,
        isAdmin: isAdmin || !!user.isAdmin,
        isDepartmentManager:
          isDeptManager || hasAnyDepartmentManagerRole || !!user.isDepartmentManager,
      };
    },
    [auth?.profile?.id, hasAnyDepartmentManagerRole, isAdmin, isDeptManager]
  );

  const peopleList = useMemo(() => {
    const byId = new Map<number, AppealParticipant>();
    const createdBy = data?.createdBy;
    if (createdBy?.id) {
      byId.set(createdBy.id, {
        user: mapParticipantUserRole(createdBy),
        isCreator: true,
        isAssignee: false,
      });
    }
    (data?.assignees || []).forEach((assignee) => {
      const user = assignee.user ? mapParticipantUserRole(assignee.user) : assignee.user;
      if (!user?.id) return;
      const existing = byId.get(user.id);
      if (existing) {
        byId.set(user.id, {
          ...existing,
          isAssignee: true,
        });
      } else {
        byId.set(user.id, {
          user,
          isCreator: false,
          isAssignee: true,
        });
      }
    });
    return Array.from(byId.values()).sort((a, b) => Number(b.isCreator) - Number(a.isCreator));
  }, [data?.assignees, data?.createdBy, mapParticipantUserRole]);

  const participantIds = useMemo(
    () =>
      peopleList
        .map((participant) => participant.user.id)
        .filter((id): id is number => Number.isFinite(id) && id > 0),
    [peopleList]
  );

  const participantPresenceMap = usePresence(participantIds);
  const assignMemberIds = useMemo(
    () =>
      (deptMembers || [])
        .map((member) => member.id)
        .filter((id): id is number => Number.isFinite(id) && id > 0),
    [deptMembers]
  );
  const assignPresenceMap = usePresence(assignMemberIds);

  const peopleModalSize = useMemo(() => {
    const width = Math.min(860, Math.max(280, windowWidth - 24));
    const height = Math.min(680, Math.max(420, windowHeight - 44));
    return { width, height };
  }, [windowHeight, windowWidth]);
  const webDefaultCursorStyle = Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null;

  const deadlineModalSize = useMemo(() => {
    const width = Math.min(560, Math.max(300, windowWidth - 24));
    const height = Math.min(460, Math.max(340, windowHeight - 84));
    return { width, height };
  }, [windowHeight, windowWidth]);

  const transferModalSize = useMemo(() => {
    const width = Math.min(620, Math.max(300, windowWidth - 24));
    const height = Math.min(620, Math.max(420, windowHeight - 60));
    return { width, height };
  }, [windowHeight, windowWidth]);

  const openPeopleList = useCallback(() => {
    setSelectedProfileUserId(null);
    setPeopleView('list');
    setPeopleModalVisible(true);
  }, []);

  const openProfileCard = useCallback((userIdToOpen: number) => {
    if (!Number.isFinite(userIdToOpen) || userIdToOpen <= 0) return;
    setSelectedProfileUserId(userIdToOpen);
    setPeopleView('profile');
    setPeopleModalVisible(true);
  }, []);

  const handlePeopleBack = useCallback(() => {
    if (peopleView === 'profile') {
      setPeopleView('list');
      setSelectedProfileUserId(null);
      return;
    }
    setPeopleModalVisible(false);
    setSelectedProfileUserId(null);
  }, [peopleView]);

  const renderAssignMemberRow = useCallback(
    (member: UserMini) => {
      const displayName =
        [member.firstName, member.lastName].filter(Boolean).join(' ') ||
        member.email ||
        'Пользователь';
      const initials = getParticipantInitials(member);
      const roleChip = getParticipantRoleChip(member);
      const roleGradient = getParticipantRoleGradient(member);
      const departmentLabel = member.department?.name || 'Без отдела';
      const presence = assignPresenceMap[member.id];
      const presenceLabel = getPresenceLabel(presence);
      const isOnline = !!presence?.isOnline;
      const isSelected = selectedAssignees.includes(member.id);

      return (
        <Pressable
          key={member.id}
          style={styles.assignRowPressable}
          onPress={() => toggleAssignee(member.id)}
        >
          <LinearGradient
            colors={roleGradient}
            start={{ x: 0, y: 0.35 }}
            end={{ x: 1, y: 1 }}
            style={styles.assignRowGradient}
          >
            <View style={styles.memberAvatarWrap}>
              <View style={styles.memberAvatar}>
                {member.avatarUrl ? (
                  <Image source={{ uri: member.avatarUrl }} style={styles.memberAvatarImage} />
                ) : (
                  <Text style={styles.memberInitials}>{initials}</Text>
                )}
              </View>
              <View
                style={[
                  styles.memberAvatarPresence,
                  { backgroundColor: isOnline ? '#22C55E' : '#94A3B8' },
                ]}
              />
            </View>

            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{displayName}</Text>
              <Text style={styles.memberPresenceText}>{presenceLabel}</Text>
              <View style={styles.memberChipRow}>
                <ParticipantChip icon={roleChip.icon} label={roleChip.label} tone={roleChip.tone} />
                <ParticipantChip icon="business-outline" label={departmentLabel} tone="gray" />
              </View>
            </View>

            <View style={styles.assignCheckboxWrap}>
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={22}
                color={isSelected ? '#2563EB' : '#64748B'}
              />
            </View>
          </LinearGradient>
        </Pressable>
      );
    },
    [assignPresenceMap, selectedAssignees]
  );

  useEffect(() => {
    if (!peopleModalVisible) {
      setPeopleSkeletonVisible(false);
      return;
    }
    setPeopleSkeletonVisible(true);
    const timer = setTimeout(() => {
      setPeopleSkeletonVisible(false);
    }, 260);
    return () => clearTimeout(timer);
  }, [peopleModalVisible, peopleView, selectedProfileUserId]);

  const dockConfirmContent = useMemo(() => {
    if (pendingDockAction === 'claim') {
      return {
        title: 'Принять обращение?',
        message: 'Вы будете назначены исполнителем обращения.',
        confirmText: 'Принять',
      };
    }
    if (pendingDockAction === 'complete') {
      return {
        title: 'Подтвердить выполнение?',
        message: 'Обращение перейдет в статус «Завершено».',
        confirmText: 'Подтвердить',
      };
    }
    if (pendingDockAction === 'reject') {
      return {
        title: 'Отклонить выполнение?',
        message: 'Обращение вернется в статус «В работе».',
        confirmText: 'Отклонить',
      };
    }
    return {
      title: 'Подтвердить действие',
      message: 'Вы уверены, что хотите продолжить?',
      confirmText: 'Подтвердить',
    };
  }, [pendingDockAction]);

  useEffect(() => {
    return () => {
      if (forceChatTimerRef.current) {
        clearTimeout(forceChatTimerRef.current);
        forceChatTimerRef.current = null;
      }
    };
  }, []);

  function openDockConfirm(action: PendingDockAction) {
    if (dockActionLoading) return;
    setPendingDockAction(action);
    setConfirmVisible(true);
  }

  function closeDockConfirm() {
    if (dockActionLoading) return;
    setConfirmVisible(false);
    setPendingDockAction(null);
  }

  async function runConfirmedDockAction() {
    if (!pendingDockAction || dockActionLoading) return;

    setDockActionLoading(true);
    let success = false;
    try {
      if (pendingDockAction === 'claim') {
        success = await handleClaim();
      } else if (pendingDockAction === 'complete') {
        success = await handleChangeStatus('COMPLETED');
      } else if (pendingDockAction === 'reject') {
        success = await handleChangeStatus('IN_PROGRESS');
      }
    } finally {
      setDockActionLoading(false);
    }

    if (success) {
      setForceChatMode(true);
      if (forceChatTimerRef.current) {
        clearTimeout(forceChatTimerRef.current);
      }
      forceChatTimerRef.current = setTimeout(() => {
        setForceChatMode(false);
        forceChatTimerRef.current = null;
      }, 900);
    }

    setConfirmVisible(false);
    setPendingDockAction(null);
  }

  const showErrorState = !!loadError && !data;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            width: '100%',
            maxWidth: isPaneMode ? undefined : 1000,
            alignSelf: isPaneMode ? undefined : 'center',
            paddingHorizontal: contentSidePadding,
            paddingTop: isPaneMode ? 0 : headerTopInset,
            flex: 1,
          }}
        >
          {showErrorState ? (
            <View style={styles.errorCard}>
              <Ionicons name="warning-outline" size={22} color="#DC2626" />
              <Text style={styles.errorTitle}>Ошибка загрузки обращения</Text>
              <Text style={styles.errorHint}>{loadError}</Text>
              {isPaneMode && onClearSelection ? (
                <Pressable
                  onPress={onClearSelection}
                  style={({ pressed }) => [styles.errorClearBtn, pressed ? styles.errorClearBtnPressed : null]}
                >
                  <Text style={styles.errorClearBtnText}>Снять выбор</Text>
                </Pressable>
              ) : null}
            </View>
          ) : data ? (
            <AppealHeader
              data={data}
              onChangeStatus={(s) => handleChangeStatus(s)}
              onAssign={openAssignModal}
              onTransfer={openTransferModal}
              onClaim={handleClaim}
              onEditDeadline={openDeadlineModal}
              onOpenParticipants={openPeopleList}
              allowedStatuses={allowedStatuses}
              canAssign={canAssign}
              canTransfer={canTransfer}
              canClaim={canClaim}
              canEditDeadline={canEditDeadline}
              canOpenParticipants={peopleList.length > 0}
            />
          ) : (
            <View style={styles.pendingHeader}>
              <ActivityIndicator size="small" color="#6B7280" />
            </View>
          )}

          <MessagesList
            ref={listRef}
            messages={messages || []}
            currentUserId={auth?.profile?.id}
            bottomInset={listBottomInset}
            onAtBottomChange={setIsAtBottom}
            hasMore={messagesMeta?.hasMoreBefore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadOlder}
            onVisibleMessageIds={handleVisibleMessageIds}
            enableVisibilityTracking={!initialLoading}
            initialAnchorMessageId={initialAnchorMessageId}
            isInitialLoading={initialLoading}
            onInitialPositioned={handleInitialPositioned}
            readActivationMode="after_user_interaction"
            onUserInteraction={handleUserInteraction}
            onRetryLocalMessage={handleRetryLocalMessage}
            onCancelLocalMessage={handleCancelLocalMessage}
            onSenderPress={openProfileCard}
          />
        </View>
      </View>

      <AppealActionDock
        visible={canRenderActions}
        dockMode={dockMode}
        isPaneMode={isPaneMode}
        contentSidePadding={contentSidePadding}
        dockBottom={dockBottom}
        isAtBottom={isAtBottom}
        closedStatus={data?.status}
        actionLoading={dockActionLoading}
        onAction={openDockConfirm}
        canAssignInClaimMode={canAssignInClaimMode}
        onAssign={openAssignModal}
        onHeightChange={setInputHeight}
        onScrollToBottom={() => listRef.current?.scrollToBottom(true)}
        onSend={sendAppealMessage}
        onInputFocus={handleUserInteraction}
      />

      <CustomAlert
        visible={confirmVisible && !!pendingDockAction}
        title={dockConfirmContent.title}
        message={dockConfirmContent.message}
        cancelText="Отмена"
        confirmText={dockConfirmContent.confirmText}
        onCancel={closeDockConfirm}
        onConfirm={() => {
          void runConfirmedDockAction();
        }}
      />

      <Modal visible={peopleModalVisible} transparent animationType="fade" onRequestClose={handlePeopleBack}>
        <Pressable style={styles.modalBackdrop} onPress={handlePeopleBack}>
          <Pressable
            style={[
              styles.modalCard,
              styles.peopleModalCard,
              webDefaultCursorStyle,
              { width: peopleModalSize.width, height: peopleModalSize.height },
            ]}
            onPress={(event) => event.stopPropagation?.()}
          >
            <View style={styles.peopleHeader}>
              <Pressable onPress={handlePeopleBack} style={styles.peopleBackBtn}>
                <Ionicons
                  name={peopleView === 'profile' ? 'arrow-back-outline' : 'close-outline'}
                  size={18}
                  color="#111827"
                />
              </Pressable>
              <Text style={styles.modalTitle}>
                {peopleView === 'profile' ? 'Карточка участника' : 'Участники обращения'}
              </Text>
              <View style={styles.peopleHeaderRight}>
                {peopleView === 'list' && canAssign ? (
                  <Pressable
                    onPress={openAssignModal}
                    style={({ pressed }) => [
                      styles.peopleHeaderActionBtn,
                      pressed ? styles.peopleHeaderActionBtnPressed : null,
                    ]}
                  >
                    <Ionicons name="person-add-outline" size={14} color="#1D4ED8" />
                    <Text style={styles.peopleHeaderActionBtnText}>Назначить</Text>
                  </Pressable>
                ) : (
                  <View style={styles.peopleHeaderSpacer} />
                )}
              </View>
            </View>

            <View style={styles.peopleBody}>
              {peopleSkeletonVisible ? (
                <PeopleModalSkeleton />
              ) : peopleView === 'list' ? (
                peopleList.length ? (
                  <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                    {peopleList.map((participant) => {
                      const person = participant.user;
                      const displayName =
                        [person.firstName, person.lastName].filter(Boolean).join(' ') ||
                        person.email ||
                        `Пользователь #${person.id}`;
                      const initials = getParticipantInitials(person);
                      const roleChip = getParticipantRoleChip(person);
                      const roleGradient = getParticipantRoleGradient(person);
                      const departmentLabel = person.department?.name || 'Без отдела';
                      const presence = participantPresenceMap[person.id];
                      const presenceLabel = getPresenceLabel(presence);
                      const isOnline = !!presence?.isOnline;

                      return (
                        <Pressable
                          key={`participant-${person.id}`}
                          style={styles.participantRowPressable}
                          onPress={() => openProfileCard(person.id)}
                        >
                          <LinearGradient
                            colors={roleGradient}
                            start={{ x: 0, y: 0.35 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.participantRowGradient}
                          >
                            <View style={styles.memberAvatarWrap}>
                              <View style={styles.memberAvatar}>
                                {person.avatarUrl ? (
                                  <Image source={{ uri: person.avatarUrl }} style={styles.memberAvatarImage} />
                                ) : (
                                  <Text style={styles.memberInitials}>{initials}</Text>
                                )}
                              </View>
                              <View
                                style={[
                                  styles.memberAvatarPresence,
                                  { backgroundColor: isOnline ? '#22C55E' : '#94A3B8' },
                                ]}
                              />
                            </View>

                            <View style={styles.memberInfo}>
                              <View style={styles.memberNameRow}>
                                <Text style={styles.memberName}>{displayName}</Text>
                                <View style={styles.memberTagRow}>
                                  {participant.isCreator ? (
                                    <View style={[styles.memberTag, styles.memberTagCreator]}>
                                      <Text style={[styles.memberTagText, styles.memberTagCreatorText]}>
                                        Создатель
                                      </Text>
                                    </View>
                                  ) : null}
                                  {participant.isAssignee ? (
                                    <View style={[styles.memberTag, styles.memberTagAssignee]}>
                                      <Text style={[styles.memberTagText, styles.memberTagAssigneeText]}>
                                        Исполнитель
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              </View>
                              <Text style={styles.memberPresenceText}>{presenceLabel}</Text>
                              <View style={styles.memberChipRow}>
                                <ParticipantChip
                                  icon={roleChip.icon}
                                  label={roleChip.label}
                                  tone={roleChip.tone}
                                />
                                <ParticipantChip icon="business-outline" label={departmentLabel} tone="gray" />
                              </View>
                            </View>
                            <Ionicons name="chevron-forward-outline" size={18} color="#6B7280" />
                          </LinearGradient>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.modalEmpty}>Участники не найдены</Text>
                )
              ) : selectedProfileUserId ? (
                <ScrollView style={styles.peopleProfileScroll} contentContainerStyle={styles.peopleProfileScrollContent}>
                  <ProfileView userId={selectedProfileUserId} />
                </ScrollView>
              ) : (
                <Text style={styles.modalEmpty}>Карточка участника недоступна</Text>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={deadlineVisible} transparent animationType="fade" onRequestClose={closeDeadlineModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeDeadlineModal}>
          <Pressable
            style={[styles.modalCard, styles.deadlineModalCard, webDefaultCursorStyle, { width: deadlineModalSize.width, height: deadlineModalSize.height }]}
            onPress={(event) => event.stopPropagation?.()}
          >
            <LinearGradient
              colors={['#E0E7FF', '#DBEAFE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.deadlineHeader}
            >
              <View style={styles.deadlineHeaderIconWrap}>
                <Ionicons name="time-outline" size={18} color="#1D4ED8" />
              </View>
              <View style={styles.deadlineHeaderTextWrap}>
                <Text style={styles.deadlineHeaderTitle}>Изменить дедлайн</Text>
                <Text style={styles.deadlineHeaderSubtitle}>Укажите новую дату и время</Text>
              </View>
              <Pressable onPress={closeDeadlineModal} style={styles.deadlineCloseBtn} disabled={deadlineSaving}>
                <Ionicons name="close" size={18} color="#334155" />
              </Pressable>
            </LinearGradient>

            <View style={styles.deadlineBody}>
              <View style={styles.deadlineHintCard}>
                <Ionicons name="calendar-outline" size={16} color="#1E3A8A" />
                <Text style={styles.deadlineHintText}>
                  Дедлайн влияет на контроль сроков и статус просрочки в карточке обращения.
                </Text>
              </View>

              <View style={styles.deadlineInputWrap}>
                <DateTimeInput
                  value={deadlineDraft ?? undefined}
                  onChange={(iso) => setDeadlineDraft(iso)}
                  placeholder="ДД.ММ.ГГ ЧЧ:ММ"
                  includeTime
                  disabledPast
                  timePrecision="minute"
                  minuteStep={5}
                />
              </View>

              {deadlineSaving ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator />
                </View>
              ) : null}
            </View>

            <View style={styles.deadlineActions}>
              <Pressable style={styles.modalBtn} onPress={closeDeadlineModal} disabled={deadlineSaving}>
                <Text style={styles.modalBtnText}>Отмена</Text>
              </Pressable>
              <Pressable style={styles.modalBtn} onPress={() => setDeadlineDraft(null)} disabled={deadlineSaving}>
                <Text style={styles.modalBtnText}>Сбросить</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, deadlineSaving && styles.modalBtnDisabled]}
                onPress={handleSaveDeadline}
                disabled={deadlineSaving}
              >
                <Ionicons name="save-outline" size={15} color="#fff" />
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>
                  {deadlineSaving ? 'Сохранение...' : 'Сохранить'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={assignVisible} transparent animationType="fade" onRequestClose={closeAssignModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeAssignModal}>
          <Pressable
            style={[styles.modalCard, styles.assignModalCard, webDefaultCursorStyle, { width: peopleModalSize.width }]}
            onPress={(event) => event.stopPropagation?.()}
          >
            <View style={styles.peopleHeader}>
              <Pressable onPress={closeAssignModal} style={styles.peopleBackBtn} disabled={assignLoading}>
                <Ionicons name="arrow-back-outline" size={18} color="#111827" />
              </Pressable>
              <Text style={styles.modalTitle}>Назначить исполнителей</Text>
              <View style={styles.peopleHeaderSpacer} />
            </View>
            {assignLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator />
              </View>
            ) : deptMembers.length ? (
              <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                {deptMembers.map((member) => renderAssignMemberRow(member))}
              </ScrollView>
            ) : (
              <Text style={styles.modalEmpty}>Сотрудников пока нет</Text>
            )}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={closeAssignModal} disabled={assignLoading}>
                <Text style={styles.modalBtnText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleSaveAssignees}
                disabled={assignLoading}
              >
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Сохранить</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={transferVisible} transparent animationType="fade" onRequestClose={closeTransferModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeTransferModal}>
          <Pressable
            style={[styles.modalCard, styles.transferModalCard, webDefaultCursorStyle, { width: transferModalSize.width, height: transferModalSize.height }]}
            onPress={(event) => event.stopPropagation?.()}
          >
            <LinearGradient
              colors={['#DBEAFE', '#E0E7FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.transferHeader}
            >
              <View style={styles.transferHeaderIconWrap}>
                <Ionicons name="swap-horizontal-outline" size={18} color="#1D4ED8" />
              </View>
              <View style={styles.transferHeaderTextWrap}>
                <Text style={styles.transferHeaderTitle}>Передать в отдел</Text>
                <Text style={styles.transferHeaderSubtitle}>Выберите новый отдел для обращения</Text>
              </View>
              <Pressable onPress={closeTransferModal} style={styles.transferCloseBtn} disabled={transferLoading}>
                <Ionicons name="close" size={18} color="#334155" />
              </Pressable>
            </LinearGradient>

            <View style={styles.transferBody}>
              <View style={styles.transferHintCard}>
                <Ionicons name="information-circle-outline" size={16} color="#92400E" />
                <Text style={styles.transferHintText}>После смены отдела текущие исполнители будут сняты автоматически.</Text>
              </View>

              {departmentsLoading ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator />
                </View>
              ) : departments.length ? (
                <ScrollView style={styles.transferDepartmentsList} contentContainerStyle={styles.transferDepartmentsListContent}>
                  {departments.map((department) => {
                    const isSelected = selectedDepartmentId === department.id;
                    return (
                      <Pressable
                        key={department.id}
                        style={({ pressed }) => [
                          styles.transferDepartmentItem,
                          isSelected && styles.transferDepartmentItemSelected,
                          pressed && styles.transferDepartmentItemPressed,
                        ]}
                        onPress={() => setSelectedDepartmentId(department.id)}
                      >
                        <View style={styles.transferDepartmentLeft}>
                          <View
                            style={[
                              styles.transferDepartmentIconWrap,
                              isSelected && styles.transferDepartmentIconWrapSelected,
                            ]}
                          >
                            <Ionicons
                              name="business-outline"
                              size={15}
                              color={isSelected ? '#1D4ED8' : '#475569'}
                            />
                          </View>
                          <Text
                            style={[
                              styles.transferDepartmentName,
                              isSelected && styles.transferDepartmentNameSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {department.name}
                          </Text>
                        </View>
                        <Ionicons
                          name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={isSelected ? '#2563EB' : '#94A3B8'}
                        />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={styles.modalEmpty}>Отделы не найдены</Text>
              )}

              {transferLoading ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator />
                </View>
              ) : null}
            </View>

            <View style={styles.transferActions}>
              <Pressable style={styles.modalBtn} onPress={closeTransferModal} disabled={transferLoading}>
                <Text style={styles.modalBtnText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, !selectedDepartmentId && styles.modalBtnDisabled]}
                onPress={handleTransferDepartment}
                disabled={!selectedDepartmentId || transferLoading}
              >
                <Ionicons name="swap-horizontal-outline" size={15} color="#fff" />
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Передать</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function getParticipantInitials(user: UserMini) {
  const first = (user.firstName || '').trim();
  const last = (user.lastName || '').trim();
  if (first || last) {
    return `${first[0] || ''}${last[0] || first[1] || ''}`.toUpperCase();
  }
  const local = (user.email || '').split('@')[0];
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  if (local.length === 1) return `${local}${local}`.toUpperCase();
  return 'U';
}

function getParticipantRoleChip(user: UserMini): {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: ParticipantChipTone;
} {
  if (user.isAdmin) {
    return {
      label: getRoleDisplayName({ name: 'admin' }),
      icon: 'shield-checkmark-outline',
      tone: 'gray',
    };
  }
  if (user.isDepartmentManager) {
    return {
      label: getRoleDisplayName({ name: 'department_manager' }),
      icon: 'ribbon-outline',
      tone: 'gray',
    };
  }
  return {
    label: getRoleDisplayName({ name: 'employee' }),
    icon: 'person-outline',
    tone: 'gray',
  };
}

function getParticipantRoleGradient(user: UserMini): [string, string] {
  if (user.isAdmin) {
    return ['#FDE68A', '#FCA5A5'];
  }
  if (user.isDepartmentManager) {
    return ['#FFEDD5', '#FED7AA'];
  }
  return ['#C7D2FE', '#E9D5FF'];
}

function getPresenceLabel(presence?: PresenceInfo) {
  if (!presence) return 'Статус неизвестен';
  if (presence.isOnline) return 'В сети';
  if (presence.lastSeenAt) {
    const parsedDate = new Date(presence.lastSeenAt);
    if (!Number.isNaN(parsedDate.getTime())) {
      return `Был(а) ${formatDistanceToNow(parsedDate, { addSuffix: true, locale: ru })}`;
    }
  }
  return 'Не в сети';
}

type ParticipantChipTone = 'gray';

function ParticipantChip({
  icon,
  label,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: ParticipantChipTone;
}) {
  const palette = {
    gray: { bg: '#F3F4F6', bd: '#E5E7EB', text: '#374151' },
  }[tone];

  return (
    <View style={[styles.participantChip, { backgroundColor: palette.bg, borderColor: palette.bd }]}>
      <Ionicons name={icon} size={13} color={palette.text} />
      <Text style={[styles.participantChipText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function PeopleModalSkeleton() {
  return (
    <View style={styles.peopleSkeletonWrap}>
      {Array.from({ length: 5 }).map((_, index) => (
        <View key={`people-skeleton-${index}`} style={styles.peopleSkeletonRow}>
          <Skeleton width={42} height={42} radius={21} colorMode="light" />
          <View style={styles.peopleSkeletonContent}>
            <Skeleton width="55%" height={12} radius={6} colorMode="light" />
            <Skeleton width="38%" height={10} radius={6} colorMode="light" />
            <View style={styles.peopleSkeletonChips}>
              <Skeleton width={88} height={24} radius={12} colorMode="light" />
              <Skeleton width={120} height={24} radius={12} colorMode="light" />
              <Skeleton width={96} height={24} radius={12} colorMode="light" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pendingHeader: {
    marginHorizontal: 0,
    marginBottom: 12,
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 8,
    alignItems: 'flex-start',
  },
  errorTitle: {
    color: '#991B1B',
    fontSize: 15,
    fontWeight: '800',
  },
  errorHint: {
    color: '#B91C1C',
    fontSize: 13,
    lineHeight: 18,
  },
  errorClearBtn: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  errorClearBtnPressed: {
    opacity: 0.9,
  },
  errorClearBtnText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '700',
  },
  inputDock: {
    position: 'absolute',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  inputWrap: {
    width: '100%',
    maxWidth: 1000,
  },
  inputWrapPane: {
    width: '100%',
  },
  actionCard: {
    paddingHorizontal: 6,
    paddingTop: 4,
  },
  closedNoticeCard: {
    minHeight: 52,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  closedNoticeText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  actionBtnSingle: {
    minHeight: 52,
    borderRadius: 22,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  actionBtnSinglePressed: {
    opacity: 0.92,
  },
  actionBtnSingleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  splitActionRow: {
    minHeight: 52,
    borderRadius: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    shadowColor: '#111827',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  splitActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  splitActionBtnApprove: {
    backgroundColor: '#16A34A',
  },
  splitActionBtnReject: {
    backgroundColor: '#DC2626',
  },
  splitActionBtnPressed: {
    opacity: 0.9,
  },
  splitActionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  splitDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  peopleModalCard: {
    paddingBottom: 12,
  },
  peopleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  peopleBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  peopleHeaderSpacer: {
    width: 32,
    height: 32,
  },
  peopleHeaderRight: {
    minWidth: 104,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  peopleHeaderActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  peopleHeaderActionBtnPressed: {
    opacity: 0.88,
  },
  peopleHeaderActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  peopleBody: {
    flex: 1,
    minHeight: 0,
  },
  peopleProfileScroll: {
    flex: 1,
  },
  peopleProfileScrollContent: {
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalHint: { fontSize: 12, color: '#6B7280' },
  modalList: { flex: 1 },
  modalListContent: { paddingBottom: 8 },
  modalLoading: { paddingVertical: 16 },
  modalEmpty: { color: '#9CA3AF', textAlign: 'center', paddingVertical: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalBtnPrimary: { backgroundColor: '#2563EB' },
  modalBtnDisabled: {
    opacity: 0.6,
  },
  modalBtnText: { fontWeight: '600', color: '#374151' },
  modalBtnTextPrimary: { color: '#fff' },
  assignModalCard: {
    maxWidth: 860,
    maxHeight: '90%',
  },
  deadlineModalCard: {
    maxWidth: 560,
    maxHeight: '92%',
    padding: 0,
    overflow: 'hidden',
  },
  deadlineHeader: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
  },
  deadlineHeaderIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deadlineHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  deadlineHeaderTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  deadlineHeaderSubtitle: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '500',
  },
  deadlineCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deadlineBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 12,
  },
  deadlineHintCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  deadlineHintText: {
    flex: 1,
    color: '#1E3A8A',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  deadlineInputWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10,
  },
  deadlineActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  transferModalCard: {
    maxWidth: 620,
    maxHeight: '92%',
    padding: 0,
    overflow: 'hidden',
  },
  transferHeader: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
  },
  transferHeaderIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  transferHeaderTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  transferHeaderSubtitle: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '500',
  },
  transferCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  transferHintCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  transferHintText: {
    flex: 1,
    color: '#78350F',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  transferDepartmentsList: {
    flex: 1,
    minHeight: 0,
  },
  transferDepartmentsListContent: {
    gap: 8,
    paddingBottom: 8,
  },
  transferDepartmentItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  transferDepartmentItemSelected: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  transferDepartmentItemPressed: {
    opacity: 0.88,
  },
  transferDepartmentLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transferDepartmentIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferDepartmentIconWrapSelected: {
    borderColor: '#93C5FD',
    backgroundColor: '#DBEAFE',
  },
  transferDepartmentName: {
    flex: 1,
    color: '#1F2937',
    fontSize: 14,
    fontWeight: '600',
  },
  transferDepartmentNameSelected: {
    color: '#1D4ED8',
  },
  transferActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  participantRowPressable: {
    marginBottom: 10,
  },
  participantRowGradient: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  assignRowPressable: {
    marginBottom: 10,
  },
  assignRowGradient: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  assignCheckboxWrap: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginLeft: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  memberAvatarWrap: {
    width: 42,
    height: 42,
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarImage: { width: 42, height: 42, borderRadius: 21 },
  memberAvatarPresence: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  memberInitials: { fontWeight: '700', color: '#1F2937', fontSize: 13 },
  memberInfo: { flex: 1, gap: 5 },
  memberNameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  memberName: { fontWeight: '700', color: '#111827', fontSize: 14, flexShrink: 1 },
  memberDept: { fontSize: 12, color: '#6B7280' },
  memberPresenceText: { fontSize: 12, color: '#64748B' },
  memberTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  memberTag: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  memberTagCreator: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  memberTagAssignee: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  memberTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  memberTagCreatorText: {
    color: '#1E40AF',
  },
  memberTagAssigneeText: {
    color: '#166534',
  },
  memberChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  participantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  participantChipText: {
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 180,
  },
  peopleSkeletonWrap: {
    flex: 1,
    gap: 10,
    paddingTop: 2,
  },
  peopleSkeletonRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  peopleSkeletonContent: {
    flex: 1,
    gap: 7,
    paddingTop: 3,
  },
  peopleSkeletonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
});

