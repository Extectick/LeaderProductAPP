import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';

import CustomAlert from '@/components/CustomAlert';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import { AdminStyles } from '@/components/admin/adminStyles';
import { ProfileStatus } from '@/types/userTypes';
import { toApiPhoneDigitsString } from '@/utils/phone';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import {
  type AdminModerationState,
  type AdminUsersListItem,
  adminUpdateUser,
  adminUpdateUserProfile,
  assignUserRole,
  type Department,
  getAdminUsersPage,
  getDepartments,
  getProfileById,
  getRoles,
  moderateEmployeeProfile,
  type RoleItem,
} from '@/utils/userService';

type Props = {
  active: boolean;
  styles: AdminStyles;
  colors: any;
  btnGradient: [string, string];
  queuedUserId: number | null;
  onConsumeQueuedUser: () => void;
};

type FilterState = {
  moderation: 'all' | AdminModerationState;
  online: 'all' | 'online' | 'offline';
  sortBy: 'lastSeenAt' | 'name' | 'status';
  sortDir: 'asc' | 'desc';
};

type EditorState = {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phone: string;
  roleId: number | null;
  departmentId: number | null;
  employeeStatus: ProfileStatus | null;
};

type ConfirmAction = {
  item: AdminUsersListItem;
  action: 'APPROVE' | 'REJECT';
  reason?: string;
};

const moderationFilters: Array<{ key: FilterState['moderation']; label: string }> = [
  { key: 'all', label: 'Все статусы' },
  { key: 'EMPLOYEE_PENDING', label: 'На проверке' },
  { key: 'EMPLOYEE_ACTIVE', label: 'Подтвержденные' },
  { key: 'EMPLOYEE_BLOCKED', label: 'Отклоненные' },
  { key: 'NO_EMPLOYEE_PROFILE', label: 'Без профиля сотрудника' },
];

const onlineFilters: Array<{ key: FilterState['online']; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'online', label: 'Онлайн' },
  { key: 'offline', label: 'Оффлайн' },
];

function moderationLabel(state: AdminModerationState) {
  if (state === 'EMPLOYEE_ACTIVE') return 'Подтвержден';
  if (state === 'EMPLOYEE_BLOCKED') return 'Отклонен';
  if (state === 'NO_EMPLOYEE_PROFILE') return 'Без профиля';
  return 'На проверке';
}

function profileStatusLabel(state: ProfileStatus) {
  if (state === 'ACTIVE') return 'Подтвержден';
  if (state === 'BLOCKED') return 'Отклонен';
  return 'На проверке';
}

function nameOf(item: AdminUsersListItem) {
  const text = [item.lastName, item.firstName, item.middleName].filter(Boolean).join(' ').trim();
  return text || item.email || `Пользователь #${item.id}`;
}

function formatPhone(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  let num = digits;
  if (num.startsWith('8')) num = `7${num.slice(1)}`;
  if (!num.startsWith('7')) num = `7${num}`;
  return `+7 (${num.slice(1, 4)}) ${num.slice(4, 7)}-${num.slice(7, 9)}-${num.slice(9, 11)}`.trim();
}

function needsModeration(item: AdminUsersListItem) {
  return item.moderationState === 'EMPLOYEE_PENDING';
}

function formatLastSeen(iso?: string | null) {
  if (!iso) return 'Нет данных';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Нет данных';
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function moderationTone(state: AdminModerationState) {
  if (state === 'EMPLOYEE_ACTIVE') return { bg: '#DCFCE7', border: '#86EFAC', text: '#166534' };
  if (state === 'EMPLOYEE_BLOCKED') return { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B' };
  if (state === 'NO_EMPLOYEE_PROFILE') return { bg: '#F3F4F6', border: '#D1D5DB', text: '#4B5563' };
  return { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' };
}

function onlineTone(isOnline?: boolean) {
  if (isOnline) return { bg: '#DCFCE7', border: '#86EFAC', text: '#166534', textValue: 'Онлайн' };
  return { bg: '#EEF2FF', border: '#C7D2FE', text: '#4338CA', textValue: 'Не в сети' };
}

function channelLabel(item: AdminUsersListItem) {
  const push = item.channels?.push ? 'push ✓' : 'push ✕';
  const telegram = item.channels?.telegram ? 'tg ✓' : 'tg ✕';
  const max = item.channels?.max ? 'max ✓' : 'max ✕';
  return `${push} • ${telegram} • ${max}`;
}

function initialsOf(item: AdminUsersListItem) {
  const first = String(item.firstName || '').trim();
  const last = String(item.lastName || '').trim();
  const source = `${first}${last}`.trim();
  if (!source) return 'U';
  return source
    .slice(0, 2)
    .toUpperCase()
    .replace(/\s+/g, '');
}

function shortTime(iso?: string | null) {
  if (!iso) return '--:--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function UsersTab({ active, colors, queuedUserId, onConsumeQueuedUser }: Props) {
  const { width } = useWindowDimensions();
  const tabBarSpacer = useTabBarSpacerHeight();
  const desktop = width >= 1200;

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [items, setItems] = useState<AdminUsersListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    moderation: 'all',
    online: 'all',
    sortBy: 'lastSeenAt',
    sortDir: 'desc',
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(() => items.find((x) => x.id === selectedId) || null, [items, selectedId]);
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminUsersListItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorUserId, setEditorUserId] = useState<number | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorInitial, setEditorInitial] = useState<EditorState | null>(null);

  const hasNext = page * limit < total;
  const pendingCountOnPage = useMemo(() => items.filter((item) => needsModeration(item)).length, [items]);

  const loadRefs = useCallback(async () => {
    const [r, d] = await Promise.all([getRoles(), getDepartments()]);
    setRoles(r);
    setDepartments(d);
  }, []);

  const loadData = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const res = await getAdminUsersPage({
        search,
        page,
        limit,
        moderationState: filters.moderation,
        online: filters.online,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
      });
      const nextItems = res.items || [];
      setItems(nextItems);
      setTotal(res.meta?.total || 0);
      setSelectedId((prev) => {
        if (!nextItems.length) return null;
        if (!prev || !nextItems.some((x) => x.id === prev)) return nextItems[0].id;
        return prev;
      });
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }, [active, filters.moderation, filters.online, filters.sortBy, filters.sortDir, limit, page, search]);

  const openEditor = useCallback(async (userId: number) => {
    setEditorUserId(userId);
    setEditorVisible(true);
    try {
      const profile = await getProfileById(userId);
      if (!profile) throw new Error('Профиль не найден');
      const next: EditorState = {
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        middleName: profile.middleName || '',
        email: profile.email || '',
        phone: formatPhone(profile.phone),
        roleId: profile.role?.id ?? null,
        departmentId: profile.employeeProfile?.department?.id ?? null,
        employeeStatus: profile.employeeProfile?.status ?? null,
      };
      setEditor(next);
      setEditorInitial(next);
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось загрузить профиль');
      setEditorVisible(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadRefs();
  }, [active, loadRefs]);

  useEffect(() => {
    if (!active) return;
    void loadData();
  }, [active, loadData]);

  useEffect(() => {
    if (!active || !queuedUserId) return;
    setSelectedId(queuedUserId);
    void openEditor(queuedUserId);
    onConsumeQueuedUser();
  }, [active, onConsumeQueuedUser, openEditor, queuedUserId]);

  const doModeration = useCallback(
    async (item: AdminUsersListItem, action: 'APPROVE' | 'REJECT', reason?: string) => {
      setActionBusyId(item.id);
      try {
        await moderateEmployeeProfile(item.id, { action, reason });
        await loadData();
        Alert.alert('Готово', action === 'APPROVE' ? 'Сотрудник подтвержден' : 'Сотрудник отклонен');
      } catch (error: any) {
        Alert.alert('Ошибка', error?.message || 'Не удалось выполнить действие');
      } finally {
        setActionBusyId(null);
      }
    },
    [loadData]
  );

  const saveEditor = useCallback(async () => {
    if (!editorUserId || !editor || !editorInitial) return;
    try {
      const patch: any = {};
      if (editor.firstName !== editorInitial.firstName) patch.firstName = editor.firstName.trim();
      if (editor.lastName !== editorInitial.lastName) patch.lastName = editor.lastName.trim();
      if (editor.middleName !== editorInitial.middleName) patch.middleName = editor.middleName.trim();
      if (editor.email !== editorInitial.email) patch.email = editor.email.trim();
      if (editor.phone !== editorInitial.phone) patch.phone = toApiPhoneDigitsString(editor.phone) || '';
      if (Object.keys(patch).length) await adminUpdateUser(editorUserId, patch);
      if (editor.roleId && editor.roleId !== editorInitial.roleId) {
        await assignUserRole(editorUserId, { roleId: editor.roleId });
      }
      const employeePatch: any = {};
      if (editor.departmentId !== editorInitial.departmentId) employeePatch.departmentId = editor.departmentId;
      if (editor.employeeStatus && editor.employeeStatus !== editorInitial.employeeStatus) {
        employeePatch.status = editor.employeeStatus;
      }
      if (Object.keys(employeePatch).length) {
        await adminUpdateUserProfile(editorUserId, 'employee', employeePatch);
      }
      setEditorVisible(false);
      await loadData();
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось сохранить');
    }
  }, [editor, editorInitial, editorUserId, loadData]);

  const confirmContent = useMemo(() => {
    if (!confirmAction) return null;
    if (confirmAction.action === 'APPROVE') {
      return {
        title: 'Подтвердить сотрудника?',
        message: `${nameOf(confirmAction.item)} получит подтверждение профиля сотрудника.`,
        confirmText: 'Подтвердить',
      };
    }
    return {
      title: 'Отклонить сотрудника?',
      message: confirmAction.reason
        ? `Профиль сотрудника "${nameOf(confirmAction.item)}" будет отклонен.\nПричина: ${confirmAction.reason}`
        : `Профиль сотрудника "${nameOf(confirmAction.item)}" будет отклонен.`,
      confirmText: 'Отклонить',
    };
  }, [confirmAction]);

  const confirmModeration = useCallback(() => {
    const current = confirmAction;
    if (!current) return;
    setConfirmAction(null);
    void doModeration(current.item, current.action, current.reason);
  }, [confirmAction, doModeration]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, gap: 8 },
        toolbar: {
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 14,
          padding: 10,
          gap: 8,
          backgroundColor: colors.cardBackground,
        },
        toolbarMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
        toolbarMetaText: {
          color: colors.secondaryText,
          fontSize: 11,
          fontWeight: '700',
          borderWidth: 1,
          borderColor: colors.inputBorder,
          backgroundColor: colors.inputBackground,
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 5,
        },
        input: {
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 7,
          color: colors.text,
          backgroundColor: colors.inputBackground,
        },
        chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
        chip: {
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 999,
          paddingHorizontal: 9,
          paddingVertical: 5,
          backgroundColor: colors.inputBackground,
        },
        chipActive: { borderColor: colors.tint, backgroundColor: `${colors.tint}15` },
        chipText: { color: colors.secondaryText, fontSize: 11, fontWeight: '700' },
        chipTextActive: { color: colors.tint },
        desktop: { flex: 1, flexDirection: 'row', gap: 12 },
        list: {
          flex: 1,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 14,
          backgroundColor: colors.cardBackground,
          overflow: 'hidden',
        },
        listHeader: {
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.inputBorder,
          backgroundColor: colors.inputBackground,
        },
        listHeaderText: { color: colors.secondaryText, fontWeight: '700', fontSize: 12 },
        side: {
          width: 360,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 14,
          backgroundColor: colors.cardBackground,
          padding: 12,
          gap: 10,
        },
        rowWrap: { paddingHorizontal: 6, paddingTop: 6 },
        row: {
          padding: 8,
          gap: 6,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 10,
          backgroundColor: colors.background,
        },
        rowSelected: { borderColor: colors.tint, backgroundColor: `${colors.tint}08` },
        rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        rowId: { color: colors.text, fontWeight: '800', fontSize: 13 },
        rowTime: { color: colors.secondaryText, fontSize: 10, fontWeight: '700' },
        tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
        tag: {
          borderRadius: 999,
          borderWidth: 1,
          paddingHorizontal: 6,
          paddingVertical: 3,
          backgroundColor: colors.inputBackground,
          borderColor: colors.inputBorder,
        },
        tagText: { color: colors.text, fontSize: 10, fontWeight: '700' },
        summaryRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
        avatarWrap: { width: 26, height: 26, position: 'relative' },
        avatar: { width: 26, height: 26, borderRadius: 13 },
        avatarFallback: {
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.tint,
        },
        avatarFallbackText: { color: '#FFFFFF', fontWeight: '800', fontSize: 9 },
        onlineDot: {
          position: 'absolute',
          right: -1,
          top: -1,
          width: 7,
          height: 7,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.background,
          backgroundColor: '#94A3B8',
        },
        rowMainTextWrap: { flex: 1, minWidth: 0 },
        rowName: { color: colors.text, fontWeight: '800', fontSize: 13 },
        rowNameMeta: { color: colors.secondaryText, fontWeight: '700', fontSize: 10 },
        rowMetaLine: { color: colors.secondaryText, fontSize: 11 },
        badge: {
          borderRadius: 999,
          borderWidth: 1,
          paddingHorizontal: 8,
          paddingVertical: 4,
        },
        badgeText: { fontSize: 11, fontWeight: '800' },
        badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
        metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
        metaCell: {
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 7,
          paddingHorizontal: 7,
          paddingVertical: 5,
          backgroundColor: colors.inputBackground,
        },
        metaLabel: { color: colors.secondaryText, fontSize: 9, fontWeight: '700' },
        metaValue: { color: colors.text, fontSize: 11, fontWeight: '700' },
        channelsText: { color: colors.secondaryText, fontSize: 11 },
        actions: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', alignItems: 'center' },
        actionHint: { color: colors.secondaryText, fontSize: 10, fontWeight: '600' },
        btn: {
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 7,
          paddingHorizontal: 7,
          paddingVertical: 4,
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 72,
        },
        btnText: { color: colors.text, fontWeight: '700', fontSize: 10 },
        pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
        paginationText: { color: colors.secondaryText, fontSize: 11, fontWeight: '700' },
        empty: { color: colors.secondaryText, fontSize: 13, textAlign: 'center', paddingVertical: 22 },
        mobileList: { gap: 6 },
        mobileCard: {
          borderRadius: 12,
          overflow: 'hidden',
        },
        modalWrap: {
          flex: 1,
          backgroundColor: 'rgba(2,6,23,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 12,
        },
        modalCard: {
          width: '100%',
          maxWidth: 760,
          maxHeight: '90%',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          backgroundColor: colors.cardBackground,
          padding: 12,
          gap: 8,
        },
        sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
        sub: { color: colors.secondaryText, fontSize: 12 },
      }),
    [colors]
  );

  if (!active) return <View style={{ display: 'none' }} />;

  const renderActionButtons = (item: AdminUsersListItem) => {
    const pending = needsModeration(item);
    return (
      <View style={styles.actions}>
        {pending ? (
          <>
            <Pressable
              disabled={actionBusyId === item.id}
              onPress={() => setConfirmAction({ item, action: 'APPROVE' })}
              style={[styles.btn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }, actionBusyId === item.id && { opacity: 0.6 }]}
            >
              <Text style={[styles.btnText, { color: '#166534' }]}>Подтвердить</Text>
            </Pressable>
            <Pressable
              disabled={actionBusyId === item.id}
              onPress={() => {
                setRejectTarget(item);
                setRejectReason('');
              }}
              style={[styles.btn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }, actionBusyId === item.id && { opacity: 0.6 }]}
            >
              <Text style={[styles.btnText, { color: '#991B1B' }]}>Отклонить</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.actionHint}>Модерация не требуется</Text>
        )}
        <Pressable onPress={() => void openEditor(item.id)} style={styles.btn}>
          <Text style={styles.btnText}>Редактировать</Text>
        </Pressable>
      </View>
    );
  };

  const renderUserRow = (item: AdminUsersListItem, selectable = true) => {
    const moderation = moderationTone(item.moderationState);
    const online = onlineTone(item.isOnline);
    const displayName = nameOf(item);
    const roleName = getRoleDisplayName(item.role);
    const departmentName = item.departmentName || 'Без отдела';
    const emailOrPhone = item.email || formatPhone(item.phone) || 'Нет контактов';
    const activityText = item.isOnline ? 'Онлайн сейчас' : formatLastSeen(item.lastSeenAt);

    return (
      <Pressable key={item.id} onPress={selectable ? () => setSelectedId(item.id) : undefined}>
        <View style={styles.rowWrap}>
          <View style={[styles.row, selectable && selectedId === item.id ? styles.rowSelected : null]}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowId}>#{item.id}</Text>
              <Text style={styles.rowTime}>{shortTime(item.lastSeenAt)}</Text>
            </View>

            <View style={styles.tagRow}>
              <View style={[styles.tag, { backgroundColor: moderation.bg, borderColor: moderation.border }]}>
                <Text style={[styles.tagText, { color: moderation.text }]}>{moderationLabel(item.moderationState)}</Text>
              </View>
              <View style={[styles.tag, { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' }]}>
                <Text style={[styles.tagText, { color: '#9A3412' }]}>{roleName}</Text>
              </View>
              <View style={[styles.tag, { backgroundColor: online.bg, borderColor: online.border }]}>
                <Text style={[styles.tagText, { color: online.text }]}>{online.textValue}</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.avatarWrap}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>{initialsOf(item)}</Text>
                  </View>
                )}
                <View style={[styles.onlineDot, { backgroundColor: item.isOnline ? '#22C55E' : '#94A3B8' }]} />
              </View>

              <View style={styles.rowMainTextWrap}>
                <Text numberOfLines={1} style={styles.rowName}>
                  {displayName} <Text style={styles.rowNameMeta}>• {departmentName}</Text>
                </Text>
                <Text numberOfLines={1} style={styles.rowMetaLine}>
                  {emailOrPhone}
                </Text>
                <Text numberOfLines={1} style={styles.rowMetaLine}>
                  {activityText}
                </Text>
              </View>
            </View>

            <Text style={styles.channelsText}>Каналы: {channelLabel(item)}</Text>
            {renderActionButtons(item)}
          </View>
        </View>
      </Pressable>
    );
  };

  const renderPagination = () => (
    <View style={styles.pagination}>
      <Pressable
        disabled={page <= 1}
        onPress={() => setPage((p) => Math.max(1, p - 1))}
        style={[styles.btn, page <= 1 && { opacity: 0.5 }]}
      >
        <Text style={styles.btnText}>Назад</Text>
      </Pressable>
      <Text style={styles.paginationText}>
        Страница {page} из {Math.max(1, Math.ceil(total / limit))}
      </Text>
      <Pressable disabled={!hasNext} onPress={() => setPage((p) => p + 1)} style={[styles.btn, !hasNext && { opacity: 0.5 }]}>
        <Text style={styles.btnText}>Вперед</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <TextInput
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Поиск по ФИО, email, телефону, ID"
          placeholderTextColor={colors.secondaryText}
          style={styles.input}
        />
        <View style={styles.toolbarMeta}>
          <Text style={styles.toolbarMetaText}>Всего пользователей: {total}</Text>
          <Text style={styles.toolbarMetaText}>На странице ждут проверки: {pendingCountOnPage}</Text>
        </View>
        <View style={styles.chips}>
          {moderationFilters.map((f) => {
            const activeFilter = filters.moderation === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  setFilters((s) => ({ ...s, moderation: f.key }));
                  setPage(1);
                }}
                style={[styles.chip, activeFilter && styles.chipActive]}
              >
                <Text style={[styles.chipText, activeFilter && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.chips}>
          {onlineFilters.map((f) => {
            const activeFilter = filters.online === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  setFilters((s) => ({ ...s, online: f.key }));
                  setPage(1);
                }}
                style={[styles.chip, activeFilter && styles.chipActive]}
              >
                <Text style={[styles.chipText, activeFilter && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {desktop ? (
        <View style={styles.desktop}>
          <View style={styles.list}>
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>Список пользователей</Text>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: tabBarSpacer + 12 }}>
              {loading ? <ActivityIndicator style={{ marginVertical: 20 }} color={colors.tint} /> : null}
              {!loading && !items.length ? <Text style={styles.empty}>Пользователи не найдены</Text> : null}
              {items.map((item) => renderUserRow(item))}
            </ScrollView>
          </View>
          <View style={styles.side}>
            <Text style={styles.sectionTitle}>Карточка пользователя</Text>
            {!selected ? (
              <Text style={styles.sub}>Выберите пользователя в списке слева</Text>
            ) : (
              <>
                <Text style={[styles.rowName, { fontSize: 16 }]}>{nameOf(selected)}</Text>
                <Text style={styles.sub}>ID: {selected.id}</Text>
                <Text style={styles.sub}>Email: {selected.email || '—'}</Text>
                <Text style={styles.sub}>Телефон: {formatPhone(selected.phone) || '—'}</Text>
                <Text style={styles.sub}>Статус модерации: {moderationLabel(selected.moderationState)}</Text>
                <Text style={styles.sub}>Роль: {getRoleDisplayName(selected.role)}</Text>
                <Text style={styles.sub}>Отдел: {selected.departmentName || 'Не назначен'}</Text>
                <Text style={styles.sub}>
                  Активность: {selected.isOnline ? 'Сейчас онлайн' : formatLastSeen(selected.lastSeenAt)}
                </Text>
                <Text style={styles.sub}>Каналы: {channelLabel(selected)}</Text>
                {renderActionButtons(selected)}
              </>
            )}
            <View style={{ marginTop: 'auto' }}>{renderPagination()}</View>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: tabBarSpacer + 12 }}>
          {loading ? <ActivityIndicator style={{ marginVertical: 20 }} color={colors.tint} /> : null}
          {!loading && !items.length ? <Text style={styles.empty}>Пользователи не найдены</Text> : null}
          <View style={styles.mobileList}>
            {items.map((item) => (
              <View key={item.id} style={styles.mobileCard}>
                {renderUserRow(item, false)}
              </View>
            ))}
          </View>
          <View style={{ marginTop: 8 }}>{renderPagination()}</View>
        </ScrollView>
      )}

      <Modal
        visible={!!rejectTarget}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setRejectTarget(null);
          setRejectReason('');
        }}
      >
        <View style={styles.modalWrap}>
          <TouchableWithoutFeedback
            onPress={() => {
              setRejectTarget(null);
              setRejectReason('');
            }}
          >
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { maxWidth: 520 }]}>
            <Text style={styles.sectionTitle}>Причина отклонения</Text>
            <Text style={styles.sub}>{rejectTarget ? nameOf(rejectTarget) : ''}</Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Укажите причину (опционально)"
              placeholderTextColor={colors.secondaryText}
              multiline
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <Pressable
                onPress={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                style={styles.btn}
              >
                <Text style={styles.btnText}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!rejectTarget) return;
                  setConfirmAction({
                    item: rejectTarget,
                    action: 'REJECT',
                    reason: rejectReason.trim() || undefined,
                  });
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                style={[styles.btn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}
              >
                <Text style={[styles.btnText, { color: '#991B1B' }]}>Далее</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={!!confirmAction && !!confirmContent}
        title={confirmContent?.title || 'Подтверждение'}
        message={confirmContent?.message || 'Вы уверены?'}
        cancelText="Отмена"
        confirmText={confirmContent?.confirmText || 'Подтвердить'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmModeration}
      />

      <Modal visible={editorVisible} transparent animationType="fade" onRequestClose={() => setEditorVisible(false)}>
        <View style={styles.modalWrap}>
          <TouchableWithoutFeedback onPress={() => setEditorVisible(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={styles.modalCard}>
            {!editor ? (
              <ActivityIndicator style={{ marginVertical: 20 }} color={colors.tint} />
            ) : (
              <>
                <Text style={styles.sectionTitle}>Редактирование пользователя #{editorUserId}</Text>
                <ScrollView contentContainerStyle={{ gap: 8 }}>
                  <TextInput
                    value={editor.lastName}
                    onChangeText={(v) => setEditor((s) => (s ? { ...s, lastName: v } : s))}
                    style={styles.input}
                    placeholder="Фамилия"
                    placeholderTextColor={colors.secondaryText}
                  />
                  <TextInput
                    value={editor.firstName}
                    onChangeText={(v) => setEditor((s) => (s ? { ...s, firstName: v } : s))}
                    style={styles.input}
                    placeholder="Имя"
                    placeholderTextColor={colors.secondaryText}
                  />
                  <TextInput
                    value={editor.middleName}
                    onChangeText={(v) => setEditor((s) => (s ? { ...s, middleName: v } : s))}
                    style={styles.input}
                    placeholder="Отчество"
                    placeholderTextColor={colors.secondaryText}
                  />
                  <TextInput
                    value={editor.email}
                    onChangeText={(v) => setEditor((s) => (s ? { ...s, email: v } : s))}
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={colors.secondaryText}
                  />
                  <TextInput
                    value={editor.phone}
                    onChangeText={(v) => setEditor((s) => (s ? { ...s, phone: formatPhone(v) } : s))}
                    style={styles.input}
                    placeholder="Телефон"
                    placeholderTextColor={colors.secondaryText}
                  />

                  <Text style={styles.sub}>Роль</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {roles.map((r) => (
                      <Pressable
                        key={`role-${r.id}`}
                        onPress={() => setEditor((s) => (s ? { ...s, roleId: r.id } : s))}
                        style={[styles.chip, editor.roleId === r.id && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, editor.roleId === r.id && styles.chipTextActive]}>
                          {getRoleDisplayName(r)}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <Text style={styles.sub}>Отдел</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    <Pressable
                      onPress={() => setEditor((s) => (s ? { ...s, departmentId: null } : s))}
                      style={[styles.chip, editor.departmentId === null && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, editor.departmentId === null && styles.chipTextActive]}>
                        Без отдела
                      </Text>
                    </Pressable>
                    {departments.map((d) => (
                      <Pressable
                        key={`dept-${d.id}`}
                        onPress={() => setEditor((s) => (s ? { ...s, departmentId: d.id } : s))}
                        style={[styles.chip, editor.departmentId === d.id && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, editor.departmentId === d.id && styles.chipTextActive]}>
                          {d.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <Text style={styles.sub}>Статус профиля сотрудника</Text>
                  <View style={styles.chips}>
                    {(['PENDING', 'ACTIVE', 'BLOCKED'] as ProfileStatus[]).map((st) => (
                      <Pressable
                        key={`st-${st}`}
                        onPress={() => setEditor((s) => (s ? { ...s, employeeStatus: st } : s))}
                        style={[styles.chip, editor.employeeStatus === st && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, editor.employeeStatus === st && styles.chipTextActive]}>
                          {profileStatusLabel(st)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                  <Pressable onPress={() => setEditorVisible(false)} style={styles.btn}>
                    <Text style={styles.btnText}>Закрыть</Text>
                  </Pressable>
                  <Pressable onPress={() => void saveEditor()} style={[styles.btn, { borderColor: colors.tint }]}>
                    <Text style={[styles.btnText, { color: colors.tint }]}>Сохранить</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
