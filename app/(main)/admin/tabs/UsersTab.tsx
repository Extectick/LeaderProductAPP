import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import CustomAlert from '@/components/CustomAlert';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import { useNotify } from '@/components/NotificationHost';
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

  const pendingCountOnPage = useMemo(() => items.filter((item) => needsModeration(item)).length, [items]);
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
  }, [active, onConsumeQueuedUser, openEditor, queuedUserId]);

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

  const hasActiveMobileFilters = filters.moderation !== 'all' || filters.online !== 'all';
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

  if (!active) return <View style={{ display: 'none' }} />;

  return (
    <View style={styles.root}>
      <View style={[styles.toolbar, !desktop && styles.toolbarCompact]}>
        <View style={[styles.toolbarTopRow, !desktop && styles.toolbarTopRowCompact]}>
          <View style={styles.toolbarSearchCol}>
            <Text style={[styles.filterGroupLabel, !desktop && styles.hidden]}>Поиск пользователей</Text>
            <TextInput
              value={search}
              onChangeText={(v) => {
                setSearch(v);
              }}
              placeholder={desktop ? 'Поиск по ФИО, email, телефону, ID' : 'Поиск'}
              placeholderTextColor={colors.secondaryText}
              style={[styles.input, styles.toolbarSearchInput, !desktop && styles.toolbarSearchInputCompact]}
            />
          </View>
          {!desktop ? (
            <Pressable
              style={[
                styles.filtersIconBtn,
                !desktop && styles.filtersIconBtnCompact,
                hasActiveMobileFilters && styles.filtersIconBtnActive,
              ]}
              onPress={() => setMobileFiltersVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Открыть фильтры пользователей"
            >
              <Ionicons name="filter-outline" size={16} color={colors.tint} />
            </Pressable>
          ) : null}
          <Pressable
            style={[
              styles.resetFiltersBtn,
              !hasActiveMobileFilters && styles.resetFiltersBtnDisabled,
              !desktop && styles.hidden,
            ]}
            onPress={() => {
              setFilters((state) => ({ ...state, moderation: 'all', online: 'all' }));
            }}
            disabled={!hasActiveMobileFilters}
            accessibilityRole="button"
            accessibilityLabel="Сбросить фильтры пользователей"
          >
            <Ionicons name="refresh-outline" size={16} color={colors.tint} />
            {desktop ? <Text style={styles.resetFiltersBtnText}>Сбросить</Text> : null}
          </Pressable>
        </View>

        <View style={[styles.toolbarMeta, !desktop && styles.toolbarMetaCompact]}>
          <Text style={[styles.toolbarMetaText, !desktop && styles.toolbarMetaTextCompact]}>
            {'\u0412\u0441\u0435\u0433\u043e \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439: '}
            {total}
          </Text>
          {desktop ? (
            <Text style={styles.toolbarMetaText}>
              {'\u041d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435 \u0436\u0434\u0443\u0442 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438: '}
              {pendingCountOnPage}
            </Text>
          ) : null}
        </View>

        {desktop ? (
          <View style={styles.filtersWrap}>
            <View style={styles.filterGroupCol}>
              <Text style={styles.filterGroupLabel}>Модерация</Text>
              <View style={styles.chips}>
                {moderationFilters.map((f) => {
                  const activeFilter = filters.moderation === f.key;
                  return (
                    <Pressable
                      key={`moderation-${f.key}`}
                      onPress={() => {
                        setFilters((s) => ({ ...s, moderation: f.key }));
                      }}
                      style={[styles.chip, activeFilter && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, activeFilter && styles.chipTextActive]}>{f.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.filterGroupCol}>
              <Text style={styles.filterGroupLabel}>Онлайн</Text>
              <View style={styles.chips}>
                {onlineFilters.map((f) => {
                  const activeFilter = filters.online === f.key;
                  return (
                    <Pressable
                      key={`online-${f.key}`}
                      onPress={() => {
                        setFilters((s) => ({ ...s, online: f.key }));
                      }}
                      style={[styles.chip, activeFilter && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, activeFilter && styles.chipTextActive]}>{f.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {desktop ? (
        <View style={styles.desktop}>
          <View style={styles.list}>
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>Список пользователей</Text>
            </View>
            <ScrollView
              contentContainerStyle={{ paddingBottom: tabBarSpacer + 12 }}
              onScroll={handleListScroll}
              scrollEventThrottle={16}
            >
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
                  onAvatarPress={() => void openEditor(item.id)}
                />
              ))}
              {loadingMore ? <ActivityIndicator style={styles.loadMoreInlineIndicator} color={colors.tint} /> : null}
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
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: tabBarSpacer + 12 }}
          onScroll={handleListScroll}
          scrollEventThrottle={16}
        >
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
                  onAvatarPress={() => void openEditor(item.id)}
                />
              </View>
            ))}
          </View>
          {loadingMore ? <ActivityIndicator style={styles.loadMoreInlineIndicator} color={colors.tint} /> : null}
        </ScrollView>
      )}

      <Modal
        visible={!desktop && mobileFiltersVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMobileFiltersVisible(false)}
      >
        <View style={styles.modalWrap}>
          <TouchableWithoutFeedback onPress={() => setMobileFiltersVisible(false)}>
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, styles.filtersModalCard]}>
            <Text style={styles.sectionTitle}>Фильтры пользователей</Text>

            <ScrollView style={styles.filtersModalScroll} contentContainerStyle={styles.filtersModalContent}>
              <View style={styles.filterGroupCol}>
                <Text style={styles.filterGroupLabel}>Модерация</Text>
                <View style={styles.chips}>
                  {moderationFilters.map((f) => {
                    const activeFilter = filters.moderation === f.key;
                    return (
                      <Pressable
                        key={`mobile-moderation-${f.key}`}
                        onPress={() => {
                          setFilters((s) => ({ ...s, moderation: f.key }));
                        }}
                        style={[styles.chip, activeFilter && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, activeFilter && styles.chipTextActive]}>{f.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.filterGroupCol}>
                <Text style={styles.filterGroupLabel}>Онлайн</Text>
                <View style={styles.chips}>
                  {onlineFilters.map((f) => {
                    const activeFilter = filters.online === f.key;
                    return (
                      <Pressable
                        key={`mobile-online-${f.key}`}
                        onPress={() => {
                          setFilters((s) => ({ ...s, online: f.key }));
                        }}
                        style={[styles.chip, activeFilter && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, activeFilter && styles.chipTextActive]}>{f.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <View style={styles.filtersModalActions}>
              <Pressable
                style={[
                  styles.resetFiltersBtn,
                  styles.filtersModalResetBtn,
                  !hasActiveMobileFilters && styles.resetFiltersBtnDisabled,
                ]}
                onPress={() => {
                  setFilters((state) => ({ ...state, moderation: 'all', online: 'all' }));
                }}
                disabled={!hasActiveMobileFilters}
              >
                <Ionicons name="refresh-outline" size={16} color={colors.tint} />
                <Text style={styles.resetFiltersBtnText}>Сбросить</Text>
              </Pressable>

              <Pressable onPress={() => setMobileFiltersVisible(false)} style={styles.modalPrimaryBtn}>
                <Text style={styles.modalPrimaryBtnText}>Готово</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
