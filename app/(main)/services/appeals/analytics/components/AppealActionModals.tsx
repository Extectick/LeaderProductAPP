import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { AppealAssignPanel, AppealDeadlinePanel, AppealTransferPanel } from '@/components/Appeals/AppealActionPanels';
import AppealStatusMenu from '@/components/Appeals/AppealStatusMenu';
import { AppealParticipantCard, AppealParticipantUser } from '@/components/Appeals/AppealParticipantCard';
import { ProfileView } from '@/components/Profile/ProfileView';
import CustomAlert from '@/components/CustomAlert';
import type {
  AppealsAnalyticsAppealItem,
  AppealsAnalyticsMeta,
  AppealStatus,
  UserMini,
} from '@/src/entities/appeal/types';
import type { ActionKey, LaborDraftState } from '../types';
import { analyticsStyles as styles } from '../styles';
import {
  formatHoursValue,
  formatRub,
  paymentStatusLabel,
  personName,
  toDraftNumericString,
} from '../helpers';

type Props = {
  selectedAppeal: AppealsAnalyticsAppealItem | null;
  periodModalVisible: boolean;
  onClosePeriodModal: () => void;
  periodDraftFrom?: string;
  periodDraftTo?: string;
  onChangePeriodDraftFrom: (value: string | undefined) => void;
  onChangePeriodDraftTo: (value: string | undefined) => void;
  onApplyPeriodDraft: () => void;

  activeAction: ActionKey | null;
  onOpenAction: (action: ActionKey) => void;
  onOpenAppeal: (appealId: number) => void;
  onCloseActionMenu: () => void;
  onCloseActionModal: () => void;
  actionBusy: boolean;

  deadlineDraft: string | null;
  onChangeDeadlineDraft: (value: string | null) => void;
  onSaveStatus: (status: AppealStatus) => void;
  onSaveDeadline: () => void;

  assignMembers: UserMini[];
  assignSelectedIds: number[];
  assignLoading: boolean;
  onToggleAssignMember: (userId: number) => void;
  onSaveAssign: () => void;

  meta: AppealsAnalyticsMeta | null;
  transferDepartmentId: number | null;
  onChangeTransferDepartmentId: (departmentId: number) => void;
  onSaveTransfer: () => void;

  laborDraft: LaborDraftState;
  onChangeLaborAccruedHours: (appealId: number, assigneeUserId: number, value: string) => void;
  onChangeLaborPaidHours: (appealId: number, assigneeUserId: number, value: string) => void;
  onSaveLabor: () => void;
};

type AnalyticsParticipant = {
  key: string;
  user: AppealParticipantUser;
  isCreator: boolean;
  isAssignee: boolean;
};

export function AppealActionModals({
  selectedAppeal,
  periodModalVisible,
  onClosePeriodModal,
  periodDraftFrom,
  periodDraftTo,
  onChangePeriodDraftFrom,
  onChangePeriodDraftTo,
  onApplyPeriodDraft,
  activeAction,
  onOpenAction,
  onOpenAppeal,
  onCloseActionMenu,
  onCloseActionModal,
  actionBusy,
  deadlineDraft,
  onChangeDeadlineDraft,
  onSaveStatus,
  onSaveDeadline,
  assignMembers,
  assignSelectedIds,
  assignLoading,
  onToggleAssignMember,
  onSaveAssign,
  meta,
  transferDepartmentId,
  onChangeTransferDepartmentId,
  onSaveTransfer,
  laborDraft,
  onChangeLaborAccruedHours,
  onChangeLaborPaidHours,
  onSaveLabor,
}: Props) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const menuVisible = !!selectedAppeal && !activeAction;
  const isCompactWeb = Platform.OS === 'web' && viewportWidth < 720;
  const listMaxHeight = Math.max(220, Math.min(340, viewportHeight * 0.45));
  const laborListMaxHeight = Math.max(240, Math.min(380, viewportHeight * 0.5));
  const participants = React.useMemo<AnalyticsParticipant[]>(() => {
    if (!selectedAppeal) return [];

    const availableAssigneesById = new Map((meta?.availableAssignees || []).map((u) => [u.id, u]));
    const result = new Map<string, AnalyticsParticipant>();
    const creatorId = selectedAppeal.createdBy?.id ?? null;

    const addParticipant = (
      user: AnalyticsParticipant['user'],
      flags: { isCreator: boolean; isAssignee: boolean }
    ) => {
      const key =
        user.id != null
          ? `id:${user.id}`
          : user.email
            ? `email:${String(user.email).toLowerCase()}`
            : `name:${String(user.firstName || '')}:${String(user.lastName || '')}`;

      const existing = result.get(key);
      if (existing) {
        result.set(key, {
          ...existing,
          isCreator: existing.isCreator || flags.isCreator,
          isAssignee: existing.isAssignee || flags.isAssignee,
          user: { ...existing.user, ...user },
        });
        return;
      }
      result.set(key, { key, user, isCreator: flags.isCreator, isAssignee: flags.isAssignee });
    };

    const creatorFromAssignee = selectedAppeal.assignees.find((a) => a.id === creatorId);
    const creatorFromMeta = creatorId != null ? availableAssigneesById.get(creatorId) : undefined;
    addParticipant(
      {
        id: selectedAppeal.createdBy?.id ?? null,
        email: selectedAppeal.createdBy?.email ?? '',
        firstName: selectedAppeal.createdBy?.firstName ?? undefined,
        lastName: selectedAppeal.createdBy?.lastName ?? undefined,
        avatarUrl: creatorFromAssignee?.avatarUrl ?? null,
        department: creatorFromAssignee?.department ?? creatorFromMeta?.department ?? null,
        isAdmin: creatorFromAssignee?.isAdmin ?? false,
        isDepartmentManager: creatorFromAssignee?.isDepartmentManager ?? false,
      },
      { isCreator: true, isAssignee: creatorId != null && !!creatorFromAssignee }
    );

    for (const assignee of selectedAppeal.assignees || []) {
      const metaUser = availableAssigneesById.get(assignee.id);
      addParticipant(
        {
          id: assignee.id,
          email: assignee.email || '',
          firstName: assignee.firstName,
          lastName: assignee.lastName,
          avatarUrl: assignee.avatarUrl ?? null,
          department: assignee.department ?? metaUser?.department ?? null,
          isAdmin: assignee.isAdmin ?? false,
          isDepartmentManager: assignee.isDepartmentManager ?? false,
        },
        { isCreator: creatorId != null && assignee.id === creatorId, isAssignee: true }
      );
    }

    return Array.from(result.values());
  }, [meta?.availableAssignees, selectedAppeal]);
  const [laborConfirmVisible, setLaborConfirmVisible] = React.useState(false);
  const [peopleView, setPeopleView] = React.useState<'list' | 'profile'>('list');
  const [selectedProfileUserId, setSelectedProfileUserId] = React.useState<number | null>(null);
  const suppressNextBackdropCloseRef = React.useRef(false);
  const markModalInteractionStart = () => {
    suppressNextBackdropCloseRef.current = true;
  };
  const markModalInteractionEnd = () => {
    suppressNextBackdropCloseRef.current = false;
  };
  React.useEffect(() => {
    if (activeAction !== 'labor' || !selectedAppeal) {
      setLaborConfirmVisible(false);
    }
  }, [activeAction, selectedAppeal]);
  React.useEffect(() => {
    if (activeAction !== 'participants') {
      setPeopleView('list');
      setSelectedProfileUserId(null);
    }
  }, [activeAction]);
  const openProfileCard = (userIdToOpen?: number | null) => {
    if (!Number.isFinite(userIdToOpen) || Number(userIdToOpen) <= 0) return;
    setSelectedProfileUserId(Number(userIdToOpen));
    setPeopleView('profile');
  };
  const handlePeopleBack = () => {
    if (peopleView === 'profile') {
      setPeopleView('list');
      setSelectedProfileUserId(null);
      return;
    }
    onCloseActionModal();
  };
  const modalContentGuardProps =
    Platform.OS === 'web'
      ? ({
          onMouseDownCapture: markModalInteractionStart,
          onMouseDown: markModalInteractionStart,
          onTouchStart: markModalInteractionStart,
          onMouseUp: markModalInteractionEnd,
          onTouchEnd: markModalInteractionEnd,
          onClick: (event: any) => {
            event.stopPropagation?.();
            markModalInteractionEnd();
          },
          onStartShouldSetResponderCapture: () => {
            markModalInteractionStart();
            return false;
          },
        } as any)
      : ({
          onTouchStart: markModalInteractionStart,
          onTouchEnd: markModalInteractionEnd,
          onStartShouldSetResponderCapture: () => {
            markModalInteractionStart();
            return false;
          },
        } as any);

  const handleBackdropPress = (onClose: () => void) => () => {
    if (suppressNextBackdropCloseRef.current) {
      suppressNextBackdropCloseRef.current = false;
      return;
    }
    onClose();
  };

  const primaryBtnStyle = (state: any) => [
    styles.modalBtnPrimary,
    state?.hovered && styles.modalBtnPrimaryHover,
    state?.pressed && styles.modalBtnPrimaryPressed,
  ];

  const secondaryBtnStyle = (state: any) => [
    styles.modalBtnSecondary,
    state?.hovered && styles.modalBtnSecondaryHover,
    state?.pressed && styles.modalBtnSecondaryPressed,
  ];

  const menuItemStyle = (state: any) => [
    styles.menuItem,
    state?.hovered && styles.menuItemHover,
    state?.pressed && styles.menuItemPressed,
  ];

  return (
    <>
      <Modal visible={periodModalVisible} transparent animationType="fade" onRequestClose={onClosePeriodModal}>
        <Pressable style={styles.modalBackdrop} onPress={handleBackdropPress(onClosePeriodModal)}>
          <View
            style={[styles.modalCard, isCompactWeb && styles.modalCardCompact, Platform.OS === 'web' && styles.webDefaultCursor]}
            {...modalContentGuardProps}
          >
            <Text style={styles.modalTitle}>Период: от и до</Text>
            <DateTimeInput
              label="Дата начала"
              includeTime={false}
              value={periodDraftFrom}
              onChange={(iso) => onChangePeriodDraftFrom(iso)}
            />
            <DateTimeInput
              label="Дата окончания"
              includeTime={false}
              value={periodDraftTo}
              onChange={(iso) => onChangePeriodDraftTo(iso)}
            />
            <View style={styles.modalActions}>
              <Pressable style={secondaryBtnStyle} onPress={onClosePeriodModal}>
                <Text style={styles.modalBtnSecondaryText}>Отмена</Text>
              </Pressable>
              <Pressable style={primaryBtnStyle} onPress={onApplyPeriodDraft}>
                <Text style={styles.modalBtnPrimaryText}>Применить</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={onCloseActionMenu}>
        <Pressable style={styles.modalBackdrop} onPress={handleBackdropPress(onCloseActionMenu)}>
          <View
            style={[styles.menuCard, isCompactWeb && styles.menuCardCompact, Platform.OS === 'web' && styles.webDefaultCursor]}
            {...modalContentGuardProps}
          >
            <Text style={styles.modalTitle}>Действия по обращению</Text>
            {selectedAppeal ? (
              <Pressable style={menuItemStyle} onPress={() => onOpenAppeal(selectedAppeal.id)}>
                <Ionicons name="open-outline" size={16} color="#334155" />
                <Text style={styles.menuItemText}>Открыть обращение</Text>
              </Pressable>
            ) : null}
            {selectedAppeal?.actionPermissions.canChangeStatus ? (
              <Pressable style={menuItemStyle} onPress={() => onOpenAction('status')}>
                <Ionicons name="sync-outline" size={16} color="#334155" />
                <Text style={styles.menuItemText}>Изменить статус</Text>
              </Pressable>
            ) : null}
            {selectedAppeal?.actionPermissions.canEditDeadline ? (
              <Pressable style={menuItemStyle} onPress={() => onOpenAction('deadline')}>
                <Ionicons name="time-outline" size={16} color="#334155" />
                <Text style={styles.menuItemText}>Изменить дедлайн</Text>
              </Pressable>
            ) : null}
            {selectedAppeal?.actionPermissions.canAssign ? (
              <Pressable style={menuItemStyle} onPress={() => onOpenAction('assign')}>
                <Ionicons name="person-add-outline" size={16} color="#334155" />
                <Text style={styles.menuItemText}>Назначить</Text>
              </Pressable>
            ) : null}
            {selectedAppeal?.actionPermissions.canOpenParticipants ? (
              <Pressable style={menuItemStyle} onPress={() => onOpenAction('participants')}>
                <Ionicons name="people-outline" size={16} color="#334155" />
                <Text style={styles.menuItemText}>Участники</Text>
              </Pressable>
            ) : null}
            {selectedAppeal?.actionPermissions.canTransfer ? (
              <Pressable style={menuItemStyle} onPress={() => onOpenAction('transfer')}>
                <Ionicons name="swap-horizontal-outline" size={16} color="#334155" />
                <Text style={styles.menuItemText}>Передать в отдел</Text>
              </Pressable>
            ) : null}
            {selectedAppeal?.actionPermissions.canSetLabor ? (
              <Pressable style={menuItemStyle} onPress={() => onOpenAction('labor')}>
                <Ionicons name="timer-outline" size={16} color="#334155" />
                <Text style={styles.menuItemText}>Часы и выплаты</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Modal>

      <AppealStatusMenu
        visible={activeAction === 'status' && !!selectedAppeal}
        current={selectedAppeal?.status || 'OPEN'}
        allowed={selectedAppeal?.allowedStatuses || []}
        onSelect={(nextStatus) => !actionBusy && onSaveStatus(nextStatus)}
        onClose={() => !actionBusy && onCloseActionModal()}
      />

      <Modal
        visible={activeAction === 'deadline' && !!selectedAppeal}
        transparent
        animationType="fade"
        onRequestClose={onCloseActionModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleBackdropPress(onCloseActionModal)}>
          <View
            style={[
              styles.modalCard,
              styles.deadlineModalCard,
              isCompactWeb && styles.modalCardCompact,
              Platform.OS === 'web' && styles.webDefaultCursor,
            ]}
            {...modalContentGuardProps}
          >
            <AppealDeadlinePanel
              value={deadlineDraft}
              onChange={onChangeDeadlineDraft}
              onClose={onCloseActionModal}
              onSave={onSaveDeadline}
              isBusy={actionBusy}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={activeAction === 'assign' && !!selectedAppeal}
        transparent
        animationType="fade"
        onRequestClose={onCloseActionModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleBackdropPress(onCloseActionModal)}>
          <View
            style={[
              styles.modalCard,
              styles.assignModalCard,
              isCompactWeb && styles.modalCardCompact,
              Platform.OS === 'web' && styles.webDefaultCursor,
            ]}
            {...modalContentGuardProps}
          >
            <AppealAssignPanel
              members={assignMembers}
              selectedIds={assignSelectedIds}
              onToggleMember={onToggleAssignMember}
              onClose={onCloseActionModal}
              onSave={onSaveAssign}
              loading={assignLoading}
              saveBusy={actionBusy}
              listMaxHeight={listMaxHeight}
              getPresenceText={(user) => user.email || 'Нет данных'}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={activeAction === 'participants' && !!selectedAppeal}
        transparent
        animationType="fade"
        onRequestClose={handlePeopleBack}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleBackdropPress(handlePeopleBack)}>
          <View
            style={[
              styles.modalCard,
              styles.peopleModalCard,
              isCompactWeb && styles.modalCardCompact,
              Platform.OS === 'web' && styles.webDefaultCursor,
            ]}
            {...modalContentGuardProps}
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
                {peopleView === 'list' && selectedAppeal?.actionPermissions.canAssign ? (
                  <Pressable style={styles.peopleHeaderActionBtn} onPress={() => onOpenAction('assign')}>
                    <Ionicons name="person-add-outline" size={14} color="#1D4ED8" />
                    <Text style={styles.peopleHeaderActionBtnText}>Назначить</Text>
                  </Pressable>
                ) : (
                  <View style={styles.peopleHeaderSpacer} />
                )}
              </View>
            </View>

            <View style={styles.peopleBody}>
              {peopleView === 'list' && participants.length === 0 ? (
                <Text style={styles.modalEmpty}>Участники не найдены</Text>
              ) : peopleView === 'list' ? (
                <ScrollView
                  style={[styles.modalList, { maxHeight: listMaxHeight }]}
                  contentContainerStyle={styles.modalListContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {participants.map((participant) => {
                    const person = participant.user;
                    const presenceText = person.email || 'Нет данных';
                    const displayName =
                      [person.firstName, person.lastName].filter(Boolean).join(' ').trim() ||
                      person.email ||
                      `Пользователь #${person.id ?? '-'}`;

                    return (
                      <Pressable
                        key={participant.key}
                        style={styles.participantRowPressable}
                        onPress={() => openProfileCard(person.id)}
                      >
                        <AppealParticipantCard
                          user={person}
                          displayName={displayName}
                          isCreator={participant.isCreator}
                          isAssignee={participant.isAssignee}
                          presenceText={presenceText}
                          rightSlot={<Ionicons name="chevron-forward-outline" size={18} color="#6B7280" />}
                        />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : selectedProfileUserId ? (
                <ScrollView style={styles.peopleProfileScroll} contentContainerStyle={styles.peopleProfileScrollContent}>
                  <ProfileView userId={selectedProfileUserId} />
                </ScrollView>
              ) : (
                <Text style={styles.modalEmpty}>Карточка участника недоступна</Text>
              )}
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={activeAction === 'transfer' && !!selectedAppeal}
        transparent
        animationType="fade"
        onRequestClose={onCloseActionModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleBackdropPress(onCloseActionModal)}>
          <View
            style={[
              styles.modalCard,
              styles.transferModalCard,
              isCompactWeb && styles.modalCardCompact,
              Platform.OS === 'web' && styles.webDefaultCursor,
            ]}
            {...modalContentGuardProps}
          >
            <AppealTransferPanel
              departments={(meta?.availableDepartments || []).map((dep) => ({ id: dep.id, name: dep.name }))}
              selectedDepartmentId={transferDepartmentId}
              onSelectDepartment={onChangeTransferDepartmentId}
              onClose={onCloseActionModal}
              onSubmit={onSaveTransfer}
              isBusy={actionBusy}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={activeAction === 'labor' && !!selectedAppeal}
        transparent
        animationType="fade"
        onRequestClose={onCloseActionModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleBackdropPress(onCloseActionModal)}>
          <View
            style={[
              styles.modalCard,
              isCompactWeb && styles.modalCardCompact,
              { maxWidth: 700 },
              Platform.OS === 'web' && styles.webDefaultCursor,
            ]}
            {...modalContentGuardProps}
          >
            <Text style={styles.modalTitle}>Часы и выплаты</Text>
            {!selectedAppeal?.toDepartment.paymentRequired ? (
              <Text style={styles.modalHint}>Для отдела установлено правило: оплата не требуется.</Text>
            ) : (
              <Text style={styles.modalHint}>Укажите начисленные и выплаченные часы. Частичная выплата поддерживается.</Text>
            )}
            <ScrollView
              style={{ maxHeight: laborListMaxHeight }}
              contentContainerStyle={styles.modalListContent}
              keyboardShouldPersistTaps="handled"
            >
              {(selectedAppeal?.assignees || []).map((assignee) => {
                const appealId = selectedAppeal!.id;
                const draft = laborDraft[appealId]?.[assignee.id] || {};
                const existing = (selectedAppeal?.laborEntries || []).find((entry) => entry.assigneeUserId === assignee.id);
                const accruedRaw = Number(draft.accruedHours ?? existing?.accruedHours ?? 0);
                const paidRaw = Number(draft.paidHours ?? existing?.paidHours ?? 0);
                const normalizedAccruedRaw = Number.isFinite(accruedRaw) && accruedRaw >= 0 ? accruedRaw : 0;
                const normalizedPaidRaw = Number.isFinite(paidRaw) && paidRaw >= 0 ? paidRaw : 0;
                const effectiveRate = existing?.effectiveHourlyRateRub ?? assignee.effectiveHourlyRateRub ?? 0;
                const payable = (existing?.payable ?? (effectiveRate > 0)) && selectedAppeal!.toDepartment.paymentRequired;
                const accruedHours = payable
                  ? Math.max(normalizedAccruedRaw, normalizedPaidRaw)
                  : normalizedAccruedRaw;
                const paidHours = payable
                  ? Math.min(accruedHours, normalizedPaidRaw)
                  : 0;
                const remainingHours = Math.max(0, Number((accruedHours - paidHours).toFixed(2)));
                const amountAccrued = Number((accruedHours * effectiveRate).toFixed(2));
                const amountPaid = Number((paidHours * effectiveRate).toFixed(2));
                const amountRemaining = Number((remainingHours * effectiveRate).toFixed(2));
                const statusLabel = !payable
                  ? 'Не требуется'
                  : paymentStatusLabel(
                      paidHours <= 0 ? 'UNPAID' : paidHours >= accruedHours ? 'PAID' : 'PARTIAL'
                    );

                return (
                  <View key={assignee.id} style={styles.rowWrap}>
                    <View style={styles.laborRowHeader}>
                      <Text style={styles.rowWrapTitle}>{personName(assignee)}</Text>
                      <Text style={styles.laborStatusText}>{statusLabel}</Text>
                    </View>

                    <View style={[styles.laborRowFields, isCompactWeb && styles.laborRowFieldsCompact]}>
                      <View style={[styles.laborFieldCol, isCompactWeb && styles.laborFieldColCompact]}>
                        <Text style={styles.filterLabel}>Начислено (ч)</Text>
                        <TextInput
                          value={draft.accruedHours ?? toDraftNumericString(existing?.accruedHours)}
                          keyboardType="decimal-pad"
                          onChangeText={(value) => onChangeLaborAccruedHours(appealId, assignee.id, value)}
                          style={styles.input}
                          placeholder="0.00"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                      <View style={[styles.laborFieldCol, isCompactWeb && styles.laborFieldColCompact]}>
                        <Text style={styles.filterLabel}>Выплачено (ч)</Text>
                        <TextInput
                          value={draft.paidHours ?? toDraftNumericString(existing?.paidHours)}
                          keyboardType="decimal-pad"
                          onChangeText={(value) => onChangeLaborPaidHours(appealId, assignee.id, value)}
                          style={[styles.input, !payable && styles.inputDisabled]}
                          editable={payable}
                          placeholder={payable ? '0.00' : 'Не требуется'}
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                      <View style={[styles.laborFieldCol, isCompactWeb && styles.laborFieldColCompact]}>
                        <Text style={styles.filterLabel}>Остаток (ч)</Text>
                        <View style={styles.readOnlyField}>
                          <Text style={styles.readOnlyFieldText}>{formatHoursValue(remainingHours, { withUnit: false })}</Text>
                        </View>
                      </View>
                      <View style={[styles.laborFieldCol, isCompactWeb && styles.laborFieldColCompact]}>
                        <Text style={styles.filterLabel}>Ставка</Text>
                        <View style={styles.readOnlyField}>
                          <Text style={styles.readOnlyFieldText}>{payable ? `${formatRub(effectiveRate)}/ч` : 'Не требуется'}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.laborAmountsRow}>
                      <Text style={styles.modalHint}>Сумма начислено: {formatRub(payable ? amountAccrued : 0)}</Text>
                      <Text style={styles.modalHint}>Сумма выплачено: {formatRub(payable ? amountPaid : 0)}</Text>
                      <Text style={styles.modalHint}>Сумма к доплате: {formatRub(payable ? amountRemaining : 0)}</Text>
                    </View>

                    <View style={styles.laborButtonsRow}>
                      <Pressable
                        style={(state: any) => [
                          styles.laborQuickBtn,
                          state?.hovered && styles.laborQuickBtnHover,
                          state?.pressed && styles.laborQuickBtnPressed,
                          !payable && styles.laborQuickBtnDisabled,
                        ]}
                        disabled={!payable}
                        onPress={() => onChangeLaborPaidHours(appealId, assignee.id, toDraftNumericString(accruedHours))}
                      >
                        <Text style={styles.laborQuickBtnText}>Выплатить все</Text>
                      </Pressable>
                      <Pressable
                        style={(state: any) => [
                          styles.laborQuickBtn,
                          styles.laborQuickBtnGhost,
                          state?.hovered && styles.laborQuickBtnHover,
                          state?.pressed && styles.laborQuickBtnPressed,
                          !payable && styles.laborQuickBtnDisabled,
                        ]}
                        disabled={!payable}
                        onPress={() => onChangeLaborPaidHours(appealId, assignee.id, '')}
                      >
                        <Text style={styles.laborQuickBtnGhostText}>Сбросить выплату</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={secondaryBtnStyle} onPress={onCloseActionModal}>
                <Text style={styles.modalBtnSecondaryText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={primaryBtnStyle}
                onPress={() => {
                  if (actionBusy) return;
                  setLaborConfirmVisible(true);
                }}
                disabled={actionBusy}
              >
                <Text style={styles.modalBtnPrimaryText}>{actionBusy ? 'Сохранение...' : 'Сохранить'}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
      <CustomAlert
        visible={laborConfirmVisible}
        title="Сохранить изменения?"
        message="Сохранить изменения по часам и выплатам?"
        cancelText="Отмена"
        confirmText="Сохранить"
        onCancel={() => setLaborConfirmVisible(false)}
        onConfirm={() => {
          setLaborConfirmVisible(false);
          onSaveLabor();
        }}
      />
    </>
  );
}
