import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { AppealParticipantCard, AppealParticipantUser } from '@/components/Appeals/AppealParticipantCard';

export type TransferDepartmentOption = {
  id: number;
  name: string;
};

type AssignPanelProps = {
  members: (AppealParticipantUser & { id: number })[];
  selectedIds: number[];
  onToggleMember: (userId: number) => void;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
  saveBusy?: boolean;
  listMaxHeight?: number;
  emptyText?: string;
  getPresenceText?: (user: AppealParticipantUser & { id: number }) => string;
  getIsOnline?: (user: AppealParticipantUser & { id: number }) => boolean;
};

export function AppealAssignPanel({
  members,
  selectedIds,
  onToggleMember,
  onClose,
  onSave,
  loading,
  saveBusy = false,
  listMaxHeight,
  emptyText = 'Сотрудников пока нет',
  getPresenceText,
  getIsOnline,
}: AssignPanelProps) {
  return (
    <>
      <View style={styles.assignHeader}>
        <Pressable onPress={onClose} style={styles.assignBackBtn} disabled={loading}>
          <Ionicons name="arrow-back-outline" size={18} color="#111827" />
        </Pressable>
        <Text style={styles.assignTitle}>Назначить исполнителей</Text>
        <View style={styles.assignHeaderSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator />
        </View>
      ) : members.length ? (
        <ScrollView
          style={[styles.assignList, listMaxHeight ? { maxHeight: listMaxHeight } : null]}
          contentContainerStyle={styles.assignListContent}
          keyboardShouldPersistTaps="handled"
        >
          {members.map((member) => {
            const selected = selectedIds.includes(member.id);
            return (
              <Pressable
                key={member.id}
                style={styles.assignRowPressable}
                onPress={() => onToggleMember(member.id)}
              >
                <AppealParticipantCard
                  user={member}
                  displayName={
                    [member.firstName, member.lastName].filter(Boolean).join(' ') ||
                    member.email ||
                    `Пользователь #${member.id}`
                  }
                  presenceText={getPresenceText ? getPresenceText(member) : member.email || 'Нет данных'}
                  isOnline={getIsOnline ? getIsOnline(member) : false}
                  showRoleTags={false}
                  style={styles.assignCard}
                  rightSlot={
                    <View style={styles.assignCheckboxWrap}>
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={selected ? '#2563EB' : '#64748B'}
                      />
                    </View>
                  }
                />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.emptyText}>{emptyText}</Text>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.secondaryBtn} onPress={onClose} disabled={loading}>
          <Text style={styles.secondaryBtnText}>Отмена</Text>
        </Pressable>
        <Pressable style={[styles.primaryBtn, (loading || saveBusy) && styles.disabledBtn]} onPress={onSave} disabled={loading || saveBusy}>
          <Text style={styles.primaryBtnText}>{saveBusy ? 'Сохранение...' : 'Сохранить'}</Text>
        </Pressable>
      </View>
    </>
  );
}

type DeadlinePanelProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  onClose: () => void;
  onSave: () => void;
  isBusy: boolean;
};

export function AppealDeadlinePanel({
  value,
  onChange,
  onClose,
  onSave,
  isBusy,
}: DeadlinePanelProps) {
  return (
    <>
      <LinearGradient
        colors={['#E0E7FF', '#DBEAFE']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerIconWrap}>
          <Ionicons name="time-outline" size={18} color="#1D4ED8" />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Изменить дедлайн</Text>
          <Text style={styles.headerSubtitle}>Укажите новую дату и время</Text>
        </View>
        <Pressable onPress={onClose} style={styles.closeBtn} disabled={isBusy}>
          <Ionicons name="close" size={18} color="#334155" />
        </Pressable>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.infoCard}>
          <Ionicons name="calendar-outline" size={16} color="#1E3A8A" />
          <Text style={styles.infoText}>
            Дедлайн влияет на контроль сроков и статус просрочки в карточке обращения.
          </Text>
        </View>

        <View style={styles.inputWrap}>
          <DateTimeInput
            value={value || undefined}
            onChange={(iso) => onChange(iso)}
            placeholder="ДД.ММ.ГГ ЧЧ:ММ"
            includeTime
            disabledPast
            timePrecision="minute"
            minuteStep={5}
          />
        </View>

        {isBusy ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.secondaryBtn} onPress={onClose} disabled={isBusy}>
          <Text style={styles.secondaryBtnText}>Отмена</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => onChange(null)} disabled={isBusy}>
          <Text style={styles.secondaryBtnText}>Сбросить</Text>
        </Pressable>
        <Pressable style={styles.primaryBtn} onPress={onSave} disabled={isBusy}>
          <Ionicons name="save-outline" size={15} color="#fff" />
          <Text style={styles.primaryBtnText}>{isBusy ? 'Сохранение...' : 'Сохранить'}</Text>
        </Pressable>
      </View>
    </>
  );
}

type TransferPanelProps = {
  departments: TransferDepartmentOption[];
  selectedDepartmentId: number | null;
  onSelectDepartment: (departmentId: number) => void;
  onClose: () => void;
  onSubmit: () => void;
  isBusy: boolean;
  isDepartmentsLoading?: boolean;
};

export function AppealTransferPanel({
  departments,
  selectedDepartmentId,
  onSelectDepartment,
  onClose,
  onSubmit,
  isBusy,
  isDepartmentsLoading = false,
}: TransferPanelProps) {
  return (
    <>
      <LinearGradient
        colors={['#DBEAFE', '#E0E7FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerIconWrap}>
          <Ionicons name="swap-horizontal-outline" size={18} color="#1D4ED8" />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Передать в отдел</Text>
          <Text style={styles.headerSubtitle}>Выберите новый отдел для обращения</Text>
        </View>
        <Pressable onPress={onClose} style={styles.closeBtn} disabled={isBusy}>
          <Ionicons name="close" size={18} color="#334155" />
        </Pressable>
      </LinearGradient>

      <View style={styles.body}>
        <View style={[styles.infoCard, styles.warningCard]}>
          <Ionicons name="information-circle-outline" size={16} color="#92400E" />
          <Text style={[styles.infoText, styles.warningText]}>
            После смены отдела текущие исполнители будут сняты автоматически.
          </Text>
        </View>

        {isDepartmentsLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
          </View>
        ) : departments.length ? (
          <ScrollView style={styles.departmentsList} contentContainerStyle={styles.departmentsListContent}>
            {departments.map((department) => {
              const isSelected = selectedDepartmentId === department.id;
              return (
                <Pressable
                  key={department.id}
                  style={({ pressed }) => [
                    styles.departmentItem,
                    isSelected && styles.departmentItemSelected,
                    pressed && styles.departmentItemPressed,
                  ]}
                  onPress={() => onSelectDepartment(department.id)}
                >
                  <View style={styles.departmentLeft}>
                    <View
                      style={[
                        styles.departmentIconWrap,
                        isSelected && styles.departmentIconWrapSelected,
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
                        styles.departmentName,
                        isSelected && styles.departmentNameSelected,
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
          <Text style={styles.emptyText}>Отделы не найдены</Text>
        )}

        {isBusy && !isDepartmentsLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.secondaryBtn} onPress={onClose} disabled={isBusy}>
          <Text style={styles.secondaryBtnText}>Отмена</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryBtn, (!selectedDepartmentId || isBusy) && styles.disabledBtn]}
          onPress={onSubmit}
          disabled={!selectedDepartmentId || isBusy}
        >
          <Ionicons name="swap-horizontal-outline" size={15} color="#fff" />
          <Text style={styles.primaryBtnText}>{isBusy ? 'Передача...' : 'Передать'}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  assignHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assignBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  assignHeaderSpacer: {
    width: 32,
    height: 32,
  },
  assignList: {
    flex: 1,
    minHeight: 0,
  },
  assignListContent: {
    paddingBottom: 8,
  },
  assignRowPressable: {
    marginBottom: 10,
  },
  assignCard: {
    borderColor: '#E5E7EB',
  },
  assignCheckboxWrap: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginLeft: 4,
  },
  header: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
  },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '500',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  infoCard: {
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
  warningCard: {
    borderColor: '#FCD34D',
    backgroundColor: '#FEF3C7',
  },
  infoText: {
    flex: 1,
    color: '#1E3A8A',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  warningText: {
    color: '#78350F',
  },
  inputWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10,
  },
  actions: {
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
  primaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#2563EB',
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  loadingWrap: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 12,
  },
  departmentsList: {
    flex: 1,
    minHeight: 0,
  },
  departmentsListContent: {
    gap: 8,
    paddingBottom: 8,
  },
  departmentItem: {
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
  departmentItemSelected: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  departmentItemPressed: {
    opacity: 0.88,
  },
  departmentLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  departmentIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  departmentIconWrapSelected: {
    borderColor: '#93C5FD',
    backgroundColor: '#DBEAFE',
  },
  departmentName: {
    flex: 1,
    color: '#1F2937',
    fontSize: 14,
    fontWeight: '600',
  },
  departmentNameSelected: {
    color: '#1D4ED8',
  },
});
