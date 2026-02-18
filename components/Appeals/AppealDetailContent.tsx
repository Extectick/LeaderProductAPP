// components/Appeals/AppealDetailContent.tsx
import { useEffect, useState, useCallback, useContext, useRef, useMemo } from 'react';
import { Alert, Platform, View, Text, Pressable, StyleSheet, Modal, ScrollView, ActivityIndicator, Image, Keyboard, Dimensions } from 'react-native';
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
  setAppeals,
  subscribe as subscribeAppeals,
} from '@/utils/appealsStore';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { Ionicons } from '@expo/vector-icons';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { getDepartments, Department } from '@/utils/userService';
import DepartmentPicker from '@/components/DepartmentPicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dismissNotificationsByKeys } from '@/utils/notificationStore';
import { dismissAppealSystemNotifications } from '@/utils/pushNotifications';
import CustomAlert from '@/components/CustomAlert';
import { useAppealMessageSend } from '@/src/features/appeals/hooks/useAppealMessageSend';
import {
  cancelAppealsOutboxMessageByLocalId,
  retryAppealsOutboxMessageByLocalId,
} from '@/src/features/appeals/sync/outbox';
import { useAppealReadController } from '@/src/features/appeals/hooks/useAppealReadController';
import { useAppealRealtimeEvents } from '@/src/features/appeals/hooks/useAppealRealtimeEvents';
import AppealActionDock from '@/src/features/appeals/ui/AppealActionDock';

type DockMode = 'chat' | 'claim' | 'creator_resolved' | 'closed';
type PendingDockAction = 'claim' | 'complete' | 'reject';

type AppealDetailContentProps = {
  appealId: number;
  mode?: 'page' | 'pane';
  onClearSelection?: () => void;
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

  const devLog = useCallback(
    (stage: string, extra?: Record<string, any>) => {
      if (!__DEV__) return;
      console.log('[appeal-open]', { appealId, stage, ...(extra || {}) });
    },
    [appealId]
  );

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
      setLoadError('Не удалось загрузить обращение');
      throw error;
    }
  }, [appealId, hasValidAppealId]);

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
        setLoadError('Не удалось загрузить обращение');
        setInitialLoading(false);
      }
    })();

    return () => {
      active = false;
      resetReadController();
    };
  }, [appealId, pageSize, devLog, hasValidAppealId, resetReadController]);
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

  const userId = auth?.profile?.id;
  const toDepartmentId = data?.toDepartment?.id;
  const deptIds = useMemo(() => {
    const ids = new Set<number>();
    (auth?.profile?.departmentRoles || []).forEach((dr) => {
      if (dr.department?.id) ids.add(dr.department.id);
    });
    if (auth?.profile?.employeeProfile?.department?.id) {
      ids.add(auth.profile.employeeProfile.department.id);
    }
    return ids;
  }, [auth?.profile?.departmentRoles, auth?.profile?.employeeProfile?.department?.id]);

  const isCreator = !!data && userId === data.createdBy?.id;
  const isAssignee = !!data && (data.assignees || []).some((a) => a.user?.id === userId);
  const isClosedStatus = !!data && (data.status === 'COMPLETED' || data.status === 'DECLINED');
  const isDeptManager = !!toDepartmentId && (auth?.profile?.departmentRoles || []).some(
    (dr) => dr.department?.id === toDepartmentId && dr.role?.name === 'department_manager'
  );
  const isDeptMember = !!toDepartmentId && deptIds.has(toDepartmentId);

  const canAssign = !!data && (isAdmin || isDeptManager);
  const canTransfer = !!data && (isAdmin || isDeptManager);
  const canClaim = !!data && !isClosedStatus && !isAssignee && !isCreator && isDeptMember;
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
      console.warn('Ошибка назначения исполнителей:', e);
    } finally {
      setAssignLoading(false);
    }
  }

  async function openTransferModal() {
    setTransferVisible(true);
    setSelectedDepartmentId(data?.toDepartment?.id ?? null);
    if (departments.length === 0) {
      try {
        const list = await getDepartments();
        setDepartments(list);
      } catch (e) {
        console.warn('Ошибка загрузки отделов:', e);
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
  const computedDockMode: DockMode =
    isAppealClosed ? 'closed' : isCreatorResolved ? 'creator_resolved' : canClaim ? 'claim' : 'chat';
  const dockMode: DockMode = canRenderActions && forceChatMode && !isAppealClosed ? 'chat' : computedDockMode;

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
              allowedStatuses={allowedStatuses}
              canAssign={canAssign}
              canTransfer={canTransfer}
              canClaim={canClaim}
              canEditDeadline={canEditDeadline}
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

      <Modal visible={deadlineVisible} transparent animationType="fade" onRequestClose={() => setDeadlineVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Изменить дедлайн</Text>
            <DateTimeInput
              value={deadlineDraft ?? undefined}
              onChange={(iso) => setDeadlineDraft(iso)}
              placeholder="ДД.ММ.ГГ ЧЧ:ММ"
              includeTime
              disabledPast
              timePrecision="minute"
              minuteStep={5}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setDeadlineVisible(false)} disabled={deadlineSaving}>
                <Text style={styles.modalBtnText}>Отмена</Text>
              </Pressable>
              <Pressable style={styles.modalBtn} onPress={() => setDeadlineDraft(null)} disabled={deadlineSaving}>
                <Text style={styles.modalBtnText}>Сбросить</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleSaveDeadline} disabled={deadlineSaving}>
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>
                  {deadlineSaving ? 'Сохранение...' : 'Сохранить'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={assignVisible} transparent animationType="fade" onRequestClose={() => setAssignVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Назначить исполнителей</Text>
            {assignLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator />
              </View>
            ) : deptMembers.length ? (
              <ScrollView style={styles.modalList}>
                {deptMembers.map((member) => {
                  const name =
                    [member.firstName, member.lastName].filter(Boolean).join(' ') ||
                    member.email ||
                    'Пользователь';
                  const initials =
                    (member.firstName || member.lastName
                      ? `${member.firstName?.[0] || ''}${member.lastName?.[0] || ''}`
                      : member.email?.[0] || 'U'
                    ).toUpperCase();
                  const isSelected = selectedAssignees.includes(member.id);
                  return (
                    <Pressable
                      key={member.id}
                      style={styles.memberRow}
                      onPress={() => toggleAssignee(member.id)}
                    >
                      <View style={styles.memberAvatar}>
                        {member.avatarUrl ? (
                          <Image source={{ uri: member.avatarUrl }} style={styles.memberAvatarImage} />
                        ) : (
                          <Text style={styles.memberInitials}>{initials}</Text>
                        )}
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{name}</Text>
                        {member.department?.name ? (
                          <Text style={styles.memberDept}>{member.department.name}</Text>
                        ) : null}
                      </View>
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? '#2563EB' : '#9CA3AF'}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.modalEmpty}>Сотрудников пока нет</Text>
            )}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setAssignVisible(false)}>
                <Text style={styles.modalBtnText}>Отмена</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleSaveAssignees}>
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Сохранить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={transferVisible} transparent animationType="fade" onRequestClose={() => setTransferVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Передать в отдел</Text>
            <Text style={styles.modalHint}>Исполнители будут сняты после смены отдела.</Text>
            <DepartmentPicker
              departments={departments}
              selectedDepartmentId={selectedDepartmentId}
              onSelect={(id) => setSelectedDepartmentId(id)}
            />
            {transferLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator />
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setTransferVisible(false)}>
                <Text style={styles.modalBtnText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleTransferDepartment}
                disabled={!selectedDepartmentId}
              >
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Передать</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
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
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalHint: { fontSize: 12, color: '#6B7280' },
  modalList: { maxHeight: 320 },
  modalLoading: { paddingVertical: 16 },
  modalEmpty: { color: '#9CA3AF', textAlign: 'center', paddingVertical: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  modalBtnPrimary: { backgroundColor: '#2563EB' },
  modalBtnText: { fontWeight: '600', color: '#374151' },
  modalBtnTextPrimary: { color: '#fff' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarImage: { width: 32, height: 32, borderRadius: 16 },
  memberInitials: { fontWeight: '700', color: '#1F2937' },
  memberInfo: { flex: 1 },
  memberName: { fontWeight: '600', color: '#111827' },
  memberDept: { fontSize: 12, color: '#6B7280' },
});

