// V:\lp\app\(main)\services\appeals\[id].tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useCallback, useContext, useRef, useMemo } from 'react';
import { Platform, View, Text, Pressable, StyleSheet, Modal, ScrollView, ActivityIndicator, Image, Keyboard, Dimensions } from 'react-native';
import {
  addAppealMessage,
  getAppealById,
  updateAppealStatus,
  assignAppeal,
  claimAppeal,
  changeAppealDepartment,
  updateAppealWatchers,
  markAppealMessageRead,
  getDepartmentMembers,
} from '@/utils/appealsService';
import { AppealDetail, AppealStatus, AppealMessage, UserMini } from '@/types/appealsTypes';
import AppealHeader from '@/components/Appeals/AppealHeader'; // <-- исправлено имя файла
import MessagesList, { MessagesListHandle } from '@/components/Appeals/MessagesList';
import AppealChatInput from '@/components/Appeals/AppealChatInput';
import { AuthContext } from '@/context/AuthContext';
import { useAppealUpdates } from '@/hooks/useAppealUpdates';
import { getMessages, setMessages, setAppeals, upsertMessage, subscribe as subscribeAppeals } from '@/utils/appealsStore';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { Ionicons } from '@expo/vector-icons';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { getDepartments, Department } from '@/utils/userService';
import DepartmentPicker from '@/components/DepartmentPicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AppealDetailScreen() {
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });
  const { id } = useLocalSearchParams<{ id: string }>();
  const appealId = Number(id);
  const router = useRouter();
  const [data, setData] = useState<AppealDetail | null>(null);
  const [messages, setMessagesState] = useState<AppealMessage[]>(getMessages(appealId));
  const auth = useContext(AuthContext);
  const { isAdmin } = useIsAdmin();
  const [inputHeight, setInputHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const insets = useSafeAreaInsets();
  const contentSidePadding = Platform.OS === 'web' ? 16 : 12;
  const listRef = useRef<MessagesListHandle>(null);
  const markPending = useRef<Set<number>>(new Set());
  const markTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [assignVisible, setAssignVisible] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [deptMembers, setDeptMembers] = useState<UserMini[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>([]);
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);

  const load = useCallback(async (force = false) => {
    const d = await getAppealById(appealId, force);
    setData(d);
    if (d?.messages) {
      await setMessages(appealId, d.messages);
      await setAppeals([d as any]);
      setMessagesState(getMessages(appealId));
    }
  }, [appealId]);

  useEffect(() => { load(); }, [load]);

  // подписка на локальный стор сообщений/апеллов
  useEffect(() => {
    const unsub = subscribeAppeals(() => {
      setMessagesState(getMessages(appealId));
    });
    return () => unsub();
  }, [appealId]);

  // Помечаем непрочитанные сообщения как прочитанные для текущего пользователя
  useEffect(() => {
    const userId = auth?.profile?.id;
    if (!data || !userId) return;
    const unread = (messages || []).filter(
      (m) => m.sender?.id !== userId && !m.isRead && !markPending.current.has(m.id)
    );
    if (unread.length === 0) return;
    if (markTimer.current) clearTimeout(markTimer.current);
    markTimer.current = setTimeout(() => {
      const targets = unread.slice(0, 10); // батчим до 10 за проход
      targets.forEach((m) => markPending.current.add(m.id));
      Promise.all(
        targets.map((m) =>
          markAppealMessageRead(appealId, m.id).catch(() => {
            markPending.current.delete(m.id);
          })
        )
      ).finally(() => {
        targets.forEach((m) => markPending.current.delete(m.id));
      });
    }, 250);
  }, [messages, appealId, auth?.profile?.id]);

  // Подписка на события конкретного обращения: новые сообщения, смена статуса и т.д.
  useAppealUpdates(appealId, (evt) => {
    if (evt.type === 'messageAdded' && evt.appealId === appealId) {
      const newMsg: AppealMessage = {
        id: evt.id || evt.messageId,
        text: evt.text || '',
        createdAt: evt.createdAt || new Date().toISOString(),
        sender: evt.sender || { id: evt.senderId, email: '' },
        attachments: evt.attachments || [],
        isRead: evt.isRead,
        readBy: evt.readBy || [],
      };
      upsertMessage(appealId, newMsg, auth?.profile?.id)
        .then(() => setMessagesState(getMessages(appealId)))
        .catch(() => {});
      // если сообщение не наше - сразу отмечаем прочитанным
      if (evt.senderId !== auth?.profile?.id) {
        void markAppealMessageRead(appealId, evt.id || evt.messageId).catch(() => {});
        // Подстраховка: подтянуть свежие данные, если вдруг сокет потеряли часть сообщений
        if (syncTimer.current) clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => load(true).catch(() => {}), 400);
      }
    } else if (evt.type === 'messageRead' && evt.appealId === appealId) {
      setMessagesState((prev) =>
        prev.map((m) =>
          m.id === evt.messageId
            ? {
                ...m,
                isRead: true,
                readBy: [...(m.readBy || []), { userId: evt.userId, readAt: evt.readAt }],
              }
            : m
        )
      );
    } else {
      void load(true);
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
  const isDeptManager = !!toDepartmentId && (auth?.profile?.departmentRoles || []).some(
    (dr) => dr.department?.id === toDepartmentId && dr.role?.name === 'department_manager'
  );
  const isDeptMember = !!toDepartmentId && deptIds.has(toDepartmentId);

  const canAssign = !!data && (isAdmin || isDeptManager);
  const canTransfer = !!data && (isAdmin || isDeptManager);
  const canClaim = !!data && !isAssignee && isDeptMember;

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

  async function handleChangeStatus(next: AppealStatus) {
    if (!data || next === data.status) return;
    try {
      setData(prev => (prev ? { ...prev, status: next } : prev));
      await updateAppealStatus(appealId, next);
      await load(true);
    } catch (e) {
      await load(true);
      console.warn('Ошибка смены статуса:', e);
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
      await load(true);
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
      await load(true);
      setTransferVisible(false);
    } catch (e) {
      console.warn('Ошибка смены отдела:', e);
    } finally {
      setTransferLoading(false);
    }
  }

  async function handleClaim() {
    if (!data) return;
    try {
      await claimAppeal(appealId);
      await load(true);
    } catch (e) {
      console.warn('Ошибка взятия обращения в работу:', e);
    }
  }

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

  if (!data) return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            width: '100%',
            maxWidth: 1000,
            alignSelf: 'center',
            paddingHorizontal: contentSidePadding,
            paddingTop: headerTopInset,
            flex: 1,
          }}
        >
          <AppealHeader
            data={data}
            onChangeStatus={(s) => handleChangeStatus(s)}
            onAssign={openAssignModal}
            onTransfer={openTransferModal}
            onClaim={handleClaim}
            onWatch={() => updateAppealWatchers(appealId, []).then(() => load(true))}
            allowedStatuses={allowedStatuses}
            canAssign={canAssign}
            canTransfer={canTransfer}
            canClaim={canClaim}
            canWatch
          />

          <MessagesList
            ref={listRef}
            messages={messages || []}
            currentUserId={auth?.profile?.id}
            bottomInset={listBottomInset}
            onAtBottomChange={setIsAtBottom}
          />
        </View>
      </View>

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
        <View style={styles.inputWrap}>
          <AppealChatInput
            bottomInset={0}
            onHeightChange={setInputHeight}
            showScrollToBottom={!isAtBottom}
            onScrollToBottom={() => listRef.current?.scrollToBottom(true)}
            onSend={async ({ text, files }) => {
              const res = await addAppealMessage(appealId, { text, files });
              // Оптимистично добавляем своё сообщение в локальный стор, чтобы не ждать сокет
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
                        email: auth.profile.email,
                        firstName: auth.profile.firstName || undefined,
                        lastName: auth.profile.lastName || undefined,
                      }
                    : undefined,
                  attachments: [],
                  readBy: [],
                  isRead: true,
                },
                auth?.profile?.id
              ).then(() => setMessagesState(getMessages(appealId)));
            }}
          />
        </View>
      </View>

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
  inputDock: {
    position: 'absolute',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  inputWrap: {
    width: '100%',
    maxWidth: 1000,
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
