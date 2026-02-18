import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import CustomAlert from '@/components/CustomAlert';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import { AdminStyles } from '@/components/admin/adminStyles';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import { type AdminUsersListItem } from '@/utils/userService';
import {
  channelLabel,
  formatLastSeen,
  formatPhone,
  moderationFilters,
  moderationLabel,
  nameOf,
  needsModeration,
  onlineFilters,
} from './usersTab.helpers';
import { useUsersActions, type UsersEditorState } from './useUsersActions';
import { createUsersTabStyles } from './usersTab.styles';
import { useUsersData } from './useUsersData';
import { UsersListItemCard } from './UsersListItemCard';
import { UsersEditorModal } from './UsersEditorModal';
import { UsersRejectReasonModal } from './UsersRejectReasonModal';
import { UsersModerationActions } from './UsersModerationActions';

type Props = {
  active: boolean;
  styles: AdminStyles;
  colors: any;
  btnGradient: [string, string];
  queuedUserId: number | null;
  onConsumeQueuedUser: () => void;
};

type ConfirmAction = {
  item: AdminUsersListItem;
  action: 'APPROVE' | 'REJECT';
  reason?: string;
};

export default function UsersTab({ active, colors, queuedUserId, onConsumeQueuedUser }: Props) {
  const { width } = useWindowDimensions();
  const tabBarSpacer = useTabBarSpacerHeight();
  const desktop = width >= 1200;
  const {
    roles,
    departments,
    items,
    total,
    page,
    setPage,
    limit,
    search,
    setSearch,
    loading,
    filters,
    setFilters,
    selectedId,
    setSelectedId,
    loadData,
  } = useUsersData(active);
  const selected = useMemo(() => items.find((x) => x.id === selectedId) || null, [items, selectedId]);
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminUsersListItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorUserId, setEditorUserId] = useState<number | null>(null);
  const [editor, setEditor] = useState<UsersEditorState | null>(null);
  const [editorInitial, setEditorInitial] = useState<UsersEditorState | null>(null);

  const hasNext = page * limit < total;
  const pendingCountOnPage = useMemo(() => items.filter((item) => needsModeration(item)).length, [items]);
  const { openEditor, doModeration, saveEditor } = useUsersActions({
    editorUserId,
    editor,
    editorInitial,
    loadData,
    setActionBusyId,
    setEditorVisible,
    setEditorUserId,
    setEditor,
    setEditorInitial,
  });

  useEffect(() => {
    if (!active || !queuedUserId) return;
    setSelectedId(queuedUserId);
    void openEditor(queuedUserId);
    onConsumeQueuedUser();
  }, [active, onConsumeQueuedUser, openEditor, queuedUserId]);

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

  const openRejectModal = useCallback((item: AdminUsersListItem) => {
    setRejectTarget(item);
    setRejectReason('');
  }, []);

  const styles = useMemo(() => createUsersTabStyles(colors), [colors]);

  if (!active) return <View style={{ display: 'none' }} />;

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
              {items.map((item) => (
                <UsersListItemCard
                  key={item.id}
                  item={item}
                  styles={styles}
                  selectable
                  isSelected={selectedId === item.id}
                  actionBusy={actionBusyId === item.id}
                  onSelect={() => setSelectedId(item.id)}
                  onApprove={() => setConfirmAction({ item, action: 'APPROVE' })}
                  onReject={() => openRejectModal(item)}
                  onEdit={() => void openEditor(item.id)}
                />
              ))}
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
                <UsersModerationActions
                  item={selected}
                  styles={styles}
                  actionBusy={actionBusyId === selected.id}
                  onApprove={() => setConfirmAction({ item: selected, action: 'APPROVE' })}
                  onReject={() => openRejectModal(selected)}
                  onEdit={() => void openEditor(selected.id)}
                />
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
                <UsersListItemCard
                  item={item}
                  styles={styles}
                  selectable={false}
                  actionBusy={actionBusyId === item.id}
                  onApprove={() => setConfirmAction({ item, action: 'APPROVE' })}
                  onReject={() => openRejectModal(item)}
                  onEdit={() => void openEditor(item.id)}
                />
              </View>
            ))}
          </View>
          <View style={{ marginTop: 8 }}>{renderPagination()}</View>
        </ScrollView>
      )}

      <UsersRejectReasonModal
        visible={!!rejectTarget}
        styles={styles}
        colors={colors}
        target={rejectTarget}
        reason={rejectReason}
        onChangeReason={setRejectReason}
        onClose={() => {
          setRejectTarget(null);
          setRejectReason('');
        }}
        onConfirm={() => {
          if (!rejectTarget) return;
          setConfirmAction({
            item: rejectTarget,
            action: 'REJECT',
            reason: rejectReason.trim() || undefined,
          });
          setRejectTarget(null);
          setRejectReason('');
        }}
      />

      <CustomAlert
        visible={!!confirmAction && !!confirmContent}
        title={confirmContent?.title || 'Подтверждение'}
        message={confirmContent?.message || 'Вы уверены?'}
        cancelText="Отмена"
        confirmText={confirmContent?.confirmText || 'Подтвердить'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmModeration}
      />

      <UsersEditorModal
        visible={editorVisible}
        styles={styles}
        colors={colors}
        editorUserId={editorUserId}
        editor={editor}
        roles={roles}
        departments={departments}
        onClose={() => setEditorVisible(false)}
        onSave={() => void saveEditor()}
        onChangeEditor={setEditor}
      />
    </View>
  );
}

