// components/Appeals/AppealDetailContent.tsx
import { useEffect, useState, useCallback, useContext, useRef, useMemo } from 'react';
import { Platform, View, Text, Pressable, StyleSheet, Modal, ScrollView, ActivityIndicator, Image, Keyboard, Dimensions, LayoutChangeEvent } from 'react-native';
import {
  addAppealMessage,
  getAppealById,
  getAppealMessagesBootstrap,
  getAppealMessagesPage,
  updateAppealStatus,
  updateAppealDeadline,
  assignAppeal,
  claimAppeal,
  changeAppealDepartment,
  markAppealMessagesReadBulk,
  getDepartmentMembers,
} from '@/utils/appealsService';
import { AppealDetail, AppealStatus, AppealMessage, UserMini, AttachmentType } from '@/types/appealsTypes';
import AppealHeader from '@/components/Appeals/AppealHeader'; // <-- исправлено имя файла
import MessagesList, { MessagesListHandle } from '@/components/Appeals/MessagesList';
import AppealChatInput from '@/components/Appeals/AppealChatInput';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { AuthContext } from '@/context/AuthContext';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';
import {
  getMessages,
  getMessagesMeta,
  setMessages,
  prependMessages,
  setAppeals,
  upsertMessage,
  updateMessage,
  removeMessage,
  applyMessageReads,
  markAppealReadLocal,
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
import { AnimatePresence, MotiView } from 'moti';

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
  const readQueueRef = useRef<Set<number>>(new Set());
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readArmedRef = useRef(false);
  const initialPositionReadyRef = useRef(false);
  const userInteractedRef = useRef(false);
  const latestVisibleIdsRef = useRef<number[]>([]);
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
    const readQueue = readQueueRef.current;
    const sessionId = openSessionRef.current + 1;
    openSessionRef.current = sessionId;
    storeSyncReadyRef.current = false;
    readArmedRef.current = false;
    initialPositionReadyRef.current = false;
    userInteractedRef.current = false;
    latestVisibleIdsRef.current = [];
    readQueue.clear();
    if (readTimerRef.current) {
      clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
    }
    if (readArmTimerRef.current) {
      clearTimeout(readArmTimerRef.current);
      readArmTimerRef.current = null;
    }

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
      if (readTimerRef.current) {
        clearTimeout(readTimerRef.current);
        readTimerRef.current = null;
      }
      if (readArmTimerRef.current) {
        clearTimeout(readArmTimerRef.current);
        readArmTimerRef.current = null;
      }
      readArmedRef.current = false;
      initialPositionReadyRef.current = false;
      userInteractedRef.current = false;
      latestVisibleIdsRef.current = [];
      readQueue.clear();
    };
  }, [appealId, pageSize, devLog, hasValidAppealId]);
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

  const messagesById = useMemo(() => {
    const map = new Map<number, AppealMessage>();
    (messages || []).forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  const flushReadQueue = useCallback(() => {
    const userId = auth?.profile?.id;
    if (!userId) return;
    const ids = Array.from(readQueueRef.current);
    readQueueRef.current.clear();
    if (!ids.length) return;
    devLog('read_bulk_sent', { count: ids.length });
    markAppealMessagesReadBulk(appealId, ids)
      .then((res) => {
        applyMessageReads(appealId, res.messageIds, userId, res.readAt);
        markAppealReadLocal(appealId);
        dismissAppealNotifications(res.messageIds);
      })
      .catch(() => {});
  }, [appealId, auth?.profile?.id, dismissAppealNotifications, devLog]);

  const enqueueReadIds = useCallback((ids: number[]) => {
    if (!ids.length) return;
    let added = false;
    ids.forEach((id) => {
      if (readQueueRef.current.has(id)) return;
      readQueueRef.current.add(id);
      added = true;
    });
    if (!added) return;
    if (readTimerRef.current) clearTimeout(readTimerRef.current);
    readTimerRef.current = setTimeout(() => {
      readTimerRef.current = null;
      flushReadQueue();
    }, 300);
  }, [flushReadQueue]);

  const processVisibleMessageIds = useCallback((ids: number[]) => {
    const userId = auth?.profile?.id;
    if (!userId || !ids.length) return;
    const eligibleIds: number[] = [];
    ids.forEach((id) => {
      const msg = messagesById.get(id);
      if (!msg) return;
      if (msg.sender?.id === userId) return;
      const alreadyRead = msg.isRead || (msg.readBy || []).some((r) => r.userId === userId);
      if (alreadyRead) return;
      eligibleIds.push(id);
    });
    enqueueReadIds(eligibleIds);
  }, [auth?.profile?.id, enqueueReadIds, messagesById]);

  const armReads = useCallback((reason: string) => {
    if (readArmedRef.current) return;
    if (readArmTimerRef.current) {
      clearTimeout(readArmTimerRef.current);
      readArmTimerRef.current = null;
    }
    readArmTimerRef.current = setTimeout(() => {
      readArmTimerRef.current = null;
      if (!initialPositionReadyRef.current) return;
      if (reason === 'user_interaction' && !userInteractedRef.current) return;
      if ((reason === 'auto_bottom' || reason === 'incoming_at_bottom') && !isAtBottom) return;
      readArmedRef.current = true;
      devLog('read_armed', { reason });
      if (latestVisibleIdsRef.current.length) {
        processVisibleMessageIds(latestVisibleIdsRef.current);
      }
    }, 280);
  }, [devLog, isAtBottom, processVisibleMessageIds]);

  const tryArmReadsAfterInteraction = useCallback(() => {
    if (!initialPositionReadyRef.current) return;
    if (!userInteractedRef.current) return;
    armReads('user_interaction');
  }, [armReads]);

  const handleUserInteraction = useCallback(() => {
    if (!userInteractedRef.current) {
      userInteractedRef.current = true;
      devLog('user_interaction_detected');
    }
    tryArmReadsAfterInteraction();
  }, [devLog, tryArmReadsAfterInteraction]);

  const handleVisibleMessageIds = useCallback((ids: number[]) => {
    latestVisibleIdsRef.current = ids;
    if (!readArmedRef.current) return;
    processVisibleMessageIds(ids);
  }, [processVisibleMessageIds]);

  useEffect(() => {
    if (initialLoading) return;
    if (!initialPositionReadyRef.current) return;
    if (!isAtBottom) return;
    armReads('auto_bottom');
  }, [armReads, initialLoading, isAtBottom]);

  useEffect(() => {
    return () => {
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
      if (readArmTimerRef.current) clearTimeout(readArmTimerRef.current);
    };
  }, []);

  // Подписка на события конкретного обращения: новые сообщения, смена статуса и т.д.
  useAppealUpdates(hasValidAppealId ? appealId : undefined, (evt) => {
    const eventName = evt.event || evt.eventType || evt.type;
    if (eventName === 'messageAdded' && evt.appealId === appealId) {
      const incomingMessageId = Number(evt.id || evt.messageId);
      const newMsg: AppealMessage = {
        id: incomingMessageId,
        appealId: evt.appealId,
        text: evt.text || '',
        type: evt.type === 'SYSTEM' ? 'SYSTEM' : 'USER',
        systemEvent: evt.systemEvent ?? null,
        createdAt: evt.createdAt || new Date().toISOString(),
        sender: evt.sender || { id: evt.senderId, email: '' },
        attachments: evt.attachments || [],
        isRead: evt.isRead,
        readBy: evt.readBy || [],
      };
      upsertMessage(appealId, newMsg, auth?.profile?.id).catch(() => {});
      const senderId = evt.senderId ?? evt.sender?.id ?? newMsg.sender?.id;
      const isIncoming = Number.isFinite(senderId) && senderId !== auth?.profile?.id;
      if (isIncoming && Number.isFinite(incomingMessageId) && initialPositionReadyRef.current && isAtBottom) {
        armReads('incoming_at_bottom');
        enqueueReadIds([incomingMessageId]);
      }
    } else if (eventName === 'messageEdited' && evt.appealId === appealId) {
      updateMessage(appealId, evt.messageId, { text: evt.text, editedAt: evt.editedAt }).catch(() => {});
    } else if (eventName === 'messageDeleted' && evt.appealId === appealId) {
      removeMessage(appealId, evt.messageId).catch(() => {});
    } else if (eventName === 'messageRead' && evt.appealId === appealId) {
      const ids = Array.isArray(evt.messageIds)
        ? evt.messageIds
        : evt.messageId
        ? [evt.messageId]
        : [];
      if (ids.length && evt.userId && evt.readAt) {
        applyMessageReads(
          appealId,
          ids,
          evt.userId,
          evt.readAt,
          auth?.profile?.id ?? evt.userId
        ).catch(() => {});
      }
    } else if (eventName === 'appealUpdated' && evt.appealId === appealId) {
      if (evt.lastMessage?.id) {
        upsertMessage(appealId, evt.lastMessage, auth?.profile?.id).catch(() => {});
      }
      if (!data) {
        void load(true, false);
        return;
      }
      const hasDeadline = Object.prototype.hasOwnProperty.call(evt, 'deadline');
      setData((prev) => {
        if (!prev) return prev;
        const nextAssignees = Array.isArray(evt.assigneeIds)
          ? evt.assigneeIds.map((id: number) => ({ user: { id, email: '' } }))
          : prev.assignees;
        return {
          ...prev,
          status: evt.status ?? prev.status,
          priority: evt.priority ?? prev.priority,
          deadline: hasDeadline ? (evt.deadline ?? null) : prev.deadline,
          assignees: nextAssignees as any,
          toDepartment:
            evt.toDepartmentId && prev.toDepartment?.id !== evt.toDepartmentId
              ? {
                  ...prev.toDepartment,
                  id: evt.toDepartmentId,
                }
              : prev.toDepartment,
        };
      });
      if (evt.toDepartmentId && data.toDepartment?.id !== evt.toDepartmentId) {
        void load(true, false);
      }
    } else if (eventName === 'statusUpdated' && evt.appealId === appealId) {
      if (!data || !evt.status) {
        void load(true, false);
        return;
      }
      setData((prev) => (prev ? { ...prev, status: evt.status } : prev));
    } else if (
      evt.appealId === appealId &&
      (eventName === 'assigneesUpdated' ||
        eventName === 'departmentChanged' ||
        eventName === 'watchersUpdated')
    ) {
      void load(true, false);
    }
  }, auth?.profile?.id, auth?.profile?.departmentRoles?.map((d) => d.department.id) ||
    auth?.profile?.employeeProfile?.department?.id);

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

  function handleActionDockLayout(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height;
    if (height > 0) {
      setInputHeight(height);
    }
  }

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

  function resolveAttachmentType(mimeType?: string | null): AttachmentType {
    const value = String(mimeType || '').toLowerCase();
    if (value.startsWith('image/')) return 'IMAGE';
    if (value.startsWith('audio/')) return 'AUDIO';
    return 'FILE';
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
          />
        </View>
      </View>

      {canRenderActions ? (
        <View
          style={[
            styles.inputDock,
            {
              bottom: dockBottom,
              left: contentSidePadding,
              right: contentSidePadding,
            },
          ]}
        >
          <View style={isPaneMode ? styles.inputWrapPane : styles.inputWrap}>
            <AnimatePresence exitBeforeEnter>
              {dockMode === 'chat' ? (
                <MotiView
                  key="dock-chat"
                  from={{ opacity: 0, translateY: 8, scale: 0.98 }}
                  animate={{ opacity: 1, translateY: 0, scale: 1 }}
                  exit={{ opacity: 0, translateY: 6, scale: 0.98 }}
                  transition={{ type: 'timing', duration: 210 }}
                >
                  <AppealChatInput
                    bottomInset={0}
                    onHeightChange={setInputHeight}
                    showScrollToBottom={!isAtBottom}
                    onScrollToBottom={() => listRef.current?.scrollToBottom(true)}
                    onSend={async ({ text, files }) => {
                      const res = await addAppealMessage(appealId, { text, files });
                      const optimisticAttachments = (files || [])
                        .filter((file) => file?.uri)
                        .map((file, index) => ({
                          id: -(index + 1),
                          fileUrl: file.uri,
                          fileName: file.name || `attachment-${index + 1}`,
                          fileType: resolveAttachmentType(file.type),
                        }));
                      const responseAttachments = Array.isArray((res as any)?.attachments)
                        ? (res as any).attachments
                        : null;
                      // Оптимистично добавляем своё сообщение в локальный стор, чтобы не ждать сокет
                      const avatarUrl =
                        auth?.profile?.avatarUrl ||
                        auth?.profile?.employeeProfile?.avatarUrl ||
                        auth?.profile?.clientProfile?.avatarUrl ||
                        auth?.profile?.supplierProfile?.avatarUrl ||
                        null;
                      const department = auth?.profile?.employeeProfile?.department || null;
                      const isDepartmentManager = (auth?.profile?.departmentRoles || []).some(
                        (dr) => dr.role?.name === 'department_manager'
                      );
                      upsertMessage(
                        appealId,
                        {
                          id: res.id,
                          appealId,
                          text: text || '',
                          createdAt: res.createdAt || new Date().toISOString(),
                          sender: auth?.profile
                            ? {
                                id: auth.profile.id,
                                email: auth.profile.email || '',
                                firstName: auth.profile.firstName || undefined,
                                lastName: auth.profile.lastName || undefined,
                                avatarUrl,
                                department,
                                isAdmin: auth.profile.role?.name === 'admin',
                                isDepartmentManager,
                              }
                            : { id: 0, email: '' },
                          attachments: responseAttachments ?? optimisticAttachments,
                          readBy: [],
                          isRead: true,
                        },
                        auth?.profile?.id
                      ).then(() => setMessagesState(getMessages(appealId)));
                    }}
                    onInputFocus={handleUserInteraction}
                  />
                </MotiView>
              ) : null}

              {dockMode === 'closed' ? (
                <MotiView
                  key="dock-closed"
                  onLayout={handleActionDockLayout}
                  from={{ opacity: 0, translateY: 8, scale: 0.98 }}
                  animate={{ opacity: 1, translateY: 0, scale: 1 }}
                  exit={{ opacity: 0, translateY: 6, scale: 0.98 }}
                  transition={{ type: 'timing', duration: 210 }}
                >
                  <View style={styles.actionCard}>
                    <View style={styles.closedNoticeCard}>
                      <Ionicons name="lock-closed-outline" size={16} color="#64748B" />
                      <Text style={styles.closedNoticeText}>
                        {data?.status === 'DECLINED' ? 'Обращение отклонено' : 'Обращение закрыто'}
                      </Text>
                    </View>
                  </View>
                </MotiView>
              ) : null}

              {dockMode === 'claim' ? (
                <MotiView
                  key="dock-claim"
                  onLayout={handleActionDockLayout}
                  from={{ opacity: 0, translateY: 8, scale: 0.98 }}
                  animate={{ opacity: 1, translateY: 0, scale: 1 }}
                  exit={{ opacity: 0, translateY: 6, scale: 0.98 }}
                  transition={{ type: 'timing', duration: 210 }}
                >
                  <View style={styles.actionCard}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionBtnSingle,
                        pressed && styles.actionBtnSinglePressed,
                      ]}
                      onPress={() => openDockConfirm('claim')}
                      disabled={dockActionLoading}
                    >
                      <Text style={styles.actionBtnSingleText}>Принять обращение</Text>
                    </Pressable>
                  </View>
                </MotiView>
              ) : null}

              {dockMode === 'creator_resolved' ? (
                <MotiView
                  key="dock-creator-resolved"
                  onLayout={handleActionDockLayout}
                  from={{ opacity: 0, translateY: 8, scale: 0.98 }}
                  animate={{ opacity: 1, translateY: 0, scale: 1 }}
                  exit={{ opacity: 0, translateY: 6, scale: 0.98 }}
                  transition={{ type: 'timing', duration: 210 }}
                >
                  <View style={styles.actionCard}>
                    <View style={styles.splitActionRow}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.splitActionBtn,
                          styles.splitActionBtnApprove,
                          pressed && styles.splitActionBtnPressed,
                        ]}
                        onPress={() => openDockConfirm('complete')}
                        disabled={dockActionLoading}
                      >
                        <Text style={styles.splitActionBtnText}>Подтвердить</Text>
                      </Pressable>
                      <View style={styles.splitDivider} />
                      <Pressable
                        style={({ pressed }) => [
                          styles.splitActionBtn,
                          styles.splitActionBtnReject,
                          pressed && styles.splitActionBtnPressed,
                        ]}
                        onPress={() => openDockConfirm('reject')}
                        disabled={dockActionLoading}
                      >
                        <Text style={styles.splitActionBtnText}>Отклонить</Text>
                      </Pressable>
                    </View>
                  </View>
                </MotiView>
              ) : null}
            </AnimatePresence>
          </View>
        </View>
      ) : null}

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
