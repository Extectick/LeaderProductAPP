import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { ActivityIndicator, Button, Chip, Dialog, IconButton, Portal, Text, TextInput } from 'react-native-paper';

import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import { useNotify } from '@/components/NotificationHost';
import { AdminStyles } from '@/components/admin/adminStyles';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import { type AdminUsersListItem } from '@/utils/userService';
import AdminPaperConfirmDialog from '../../components/AdminPaperConfirmDialog';
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
  const notify = useNotify();
  const desktop = width >= 1200;
  const {
    roles,
    departments,
    items,
    total,
    hasNextPage,
    search,
    setSearch,
    loading,
    loadingMore,
    filters,
    setFilters,
    selectedId,
    setSelectedId,
    loadData,
    loadMore,
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
  const [editorSaving, setEditorSaving] = useState(false);
  const [mobileFiltersVisible, setMobileFiltersVisible] = useState(false);
  const loadMoreLockRef = useRef(false);

  const styles = useMemo(() => createUsersTabStyles(colors), [colors]);
  const pendingCountOnPage = useMemo(() => items.filter((item) => needsModeration(item)).length, [items]);
  const hasActiveFilters = filters.moderation !== 'all' || filters.online !== 'all';
  const { openEditor, doModeration, saveEditor } = useUsersActions({
    editorUserId,
    editor,
    editorInitial,
    loadData,
    notify,
    setActionBusyId,
    setEditorVisible,
    setEditorSaving,
    setEditorUserId,
    setEditor,
    setEditorInitial,
  });

  useEffect(() => {
    if (!active || !queuedUserId) return;
    setSelectedId(queuedUserId);
    void openEditor(queuedUserId);
    onConsumeQueuedUser();
  }, [active, onConsumeQueuedUser, openEditor, queuedUserId, setSelectedId]);

  useEffect(() => {
    if (!loadingMore) loadMoreLockRef.current = false;
  }, [loadingMore]);

  const confirmContent = useMemo(() => {
    if (!confirmAction) return null;
    if (confirmAction.action === 'APPROVE') {
      return {
        title: 'Подтвердить сотрудника?',
        message: `${nameOf(confirmAction.item)} получит подтверждение профиля сотрудника.`,
        confirmText: 'Подтвердить',
        destructive: false,
      };
    }
    return {
      title: 'Отклонить сотрудника?',
      message: confirmAction.reason
        ? `Профиль сотрудника "${nameOf(confirmAction.item)}" будет отклонен.\nПричина: ${confirmAction.reason}`
        : `Профиль сотрудника "${nameOf(confirmAction.item)}" будет отклонен.`,
      confirmText: 'Отклонить',
      destructive: true,
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

  const resetFilters = useCallback(() => {
    setFilters((state) => ({ ...state, moderation: 'all', online: 'all' }));
  }, [setFilters]);

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!hasNextPage || loading || loadingMore || loadMoreLockRef.current) return;
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
      if (distanceFromBottom > 180) return;
      loadMoreLockRef.current = true;
      void loadMore();
    },
    [hasNextPage, loadMore, loading, loadingMore]
  );

  const renderFilterChips = (
    group: Array<{ key: string; label: string }>,
    current: string,
    onChange: (value: any) => void
  ) => (
    <View style={styles.chips}>
      {group.map((filter) => (
        <Chip
          key={filter.key}
          compact
          mode={current === filter.key ? 'flat' : 'outlined'}
          selected={current === filter.key}
          onPress={() => onChange(filter.key)}
        >
          {filter.label}
        </Chip>
      ))}
    </View>
  );

  const renderFilters = (mobile = false) => (
    <>
      <View style={styles.filterGroupCol}>
        <Text variant="labelMedium" style={styles.filterGroupLabel}>Модерация</Text>
        {renderFilterChips(moderationFilters, filters.moderation, (value) => setFilters((s) => ({ ...s, moderation: value })))}
      </View>
      <View style={styles.filterGroupCol}>
        <Text variant="labelMedium" style={styles.filterGroupLabel}>Онлайн</Text>
        {renderFilterChips(onlineFilters, filters.online, (value) => setFilters((s) => ({ ...s, online: value })))}
      </View>
      {mobile ? null : (
        <Button mode="outlined" compact icon="refresh" disabled={!hasActiveFilters} onPress={resetFilters} style={styles.filterResetButton}>
          Сбросить
        </Button>
      )}
    </>
  );

  if (!active) return <View style={{ display: 'none' }} />;

  return (
    <View style={styles.root}>
      <View style={[styles.toolbar, !desktop && styles.toolbarCompact]}>
        <View style={[styles.toolbarTopRow, !desktop && styles.toolbarTopRowCompact]}>
          <View style={styles.toolbarSearchCol}>
            {desktop ? <Text variant="labelMedium" style={styles.filterGroupLabel}>Поиск пользователей</Text> : null}
            <TextInput
              mode="outlined"
              dense={!desktop}
              value={search}
              onChangeText={setSearch}
              placeholder={desktop ? 'Поиск по ФИО, email, телефону, ID' : 'Поиск'}
              left={<TextInput.Icon icon="magnify" />}
              style={[styles.toolbarSearchInput, !desktop && styles.toolbarSearchInputCompact]}
            />
          </View>
          {!desktop ? (
            <IconButton
              mode={hasActiveFilters ? 'contained-tonal' : 'outlined'}
              icon="filter-outline"
              size={18}
              style={[styles.filtersIconBtn, styles.filtersIconBtnCompact]}
              onPress={() => setMobileFiltersVisible(true)}
              accessibilityLabel="Открыть фильтры пользователей"
            />
          ) : null}
        </View>

        <View style={[styles.toolbarMeta, !desktop && styles.toolbarMetaCompact]}>
          <Chip compact mode="outlined">Всего: {total}</Chip>
          {desktop ? <Chip compact mode="outlined">Ждут проверки: {pendingCountOnPage}</Chip> : null}
        </View>

        {desktop ? <View style={styles.filtersWrap}>{renderFilters()}</View> : null}
      </View>

      {desktop ? (
        <View style={styles.desktop}>
          <View style={styles.list}>
            <View style={styles.listHeader}>
              <Text variant="titleSmall" style={styles.listHeaderText}>Список пользователей</Text>
            </View>
            <ScrollView
              contentContainerStyle={{ paddingBottom: tabBarSpacer + 12 }}
              onScroll={handleListScroll}
              scrollEventThrottle={16}
            >
              {loading ? <ActivityIndicator style={{ marginVertical: 20 }} /> : null}
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
                  onAvatarPress={() => void openEditor(item.id)}
                />
              ))}
              {loadingMore ? <ActivityIndicator style={styles.loadMoreInlineIndicator} /> : null}
            </ScrollView>
          </View>

          <View style={styles.side}>
            <Text variant="titleMedium" style={styles.sectionTitle}>Карточка пользователя</Text>
            {!selected ? (
              <Text variant="bodyMedium" style={styles.sub}>Выберите пользователя в списке слева</Text>
            ) : (
              <>
                <Text variant="titleMedium" style={styles.rowName}>{nameOf(selected)}</Text>
                <Text style={styles.sub}>ID: {selected.id}</Text>
                <Text style={styles.sub}>Email: {selected.email || '—'}</Text>
                <Text style={styles.sub}>Телефон: {formatPhone(selected.phone) || '—'}</Text>
                <Text style={styles.sub}>Модерация: {moderationLabel(selected.moderationState)}</Text>
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
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: tabBarSpacer + 12 }}
          onScroll={handleListScroll}
          scrollEventThrottle={16}
        >
          {loading ? <ActivityIndicator style={{ marginVertical: 20 }} /> : null}
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
                  onAvatarPress={() => void openEditor(item.id)}
                />
              </View>
            ))}
          </View>
          {loadingMore ? <ActivityIndicator style={styles.loadMoreInlineIndicator} /> : null}
        </ScrollView>
      )}

      <Portal>
        <Dialog visible={!desktop && mobileFiltersVisible} onDismiss={() => setMobileFiltersVisible(false)}>
          <Dialog.Title>Фильтры пользователей</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.filtersModalContent}>
              {renderFilters(true)}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button icon="refresh" disabled={!hasActiveFilters} onPress={resetFilters}>Сбросить</Button>
            <Button mode="contained" onPress={() => setMobileFiltersVisible(false)}>Готово</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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

      <AdminPaperConfirmDialog
        visible={!!confirmAction && !!confirmContent}
        title={confirmContent?.title || 'Подтверждение'}
        message={confirmContent?.message || 'Вы уверены?'}
        dismissLabel="Отмена"
        confirmLabel={confirmContent?.confirmText || 'Подтвердить'}
        destructive={confirmContent?.destructive}
        onDismiss={() => setConfirmAction(null)}
        onConfirm={confirmModeration}
      />

      <UsersEditorModal
        visible={editorVisible}
        styles={styles}
        colors={colors}
        editorUserId={editorUserId}
        editor={editor}
        saving={editorSaving}
        roles={roles}
        departments={departments}
        onClose={() => {
          if (editorSaving) return;
          setEditorVisible(false);
        }}
        onSave={() => void saveEditor()}
        onChangeEditor={setEditor}
      />
    </View>
  );
}
