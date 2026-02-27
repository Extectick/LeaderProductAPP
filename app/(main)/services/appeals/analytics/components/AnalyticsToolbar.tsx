import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Dropdown from '@/components/ui/Dropdown';
import type { AppealsAnalyticsMeta, AppealStatus } from '@/src/entities/appeal/types';
import type { PaymentStateFilter, PeriodPreset, TabKey } from '../types';
import { analyticsStyles as styles } from '../styles';
import { personName } from '../helpers';

type Props = {
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  showKpiShortcut?: boolean;
  onOpenKpiShortcut?: () => void;
  periodPreset: PeriodPreset;
  periodLabel: string;
  onPeriodSelect: (value: PeriodPreset | 'custom') => void;
  departmentId?: number;
  onDepartmentChange: (departmentId: number | undefined) => void;
  assigneeUserId?: number;
  onAssigneeChange: (assigneeUserId: number | undefined) => void;
  status?: AppealStatus;
  onStatusChange: (status: AppealStatus | undefined) => void;
  paymentState?: PaymentStateFilter;
  onPaymentStateChange: (paymentState: PaymentStateFilter | undefined) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  canResetFilters: boolean;
  onResetFilters: () => void;
  exportBusy: boolean;
  onExport: (format: 'csv' | 'xlsx') => void;
  meta: AppealsAnalyticsMeta | null;
  appealsTotal: number;
  usersTotal: number;
};

export function AnalyticsToolbar({
  tab,
  onTabChange,
  showKpiShortcut = false,
  onOpenKpiShortcut,
  periodPreset,
  periodLabel,
  onPeriodSelect,
  departmentId,
  onDepartmentChange,
  assigneeUserId,
  onAssigneeChange,
  status,
  onStatusChange,
  paymentState,
  onPaymentStateChange,
  searchInput,
  onSearchInputChange,
  canResetFilters,
  onResetFilters,
  exportBusy,
  onExport,
  meta,
  appealsTotal,
  usersTotal,
}: Props) {
  const { width: viewportWidth } = useWindowDimensions();
  const isCompactFilters = viewportWidth < 980;
  const [filtersModalVisible, setFiltersModalVisible] = React.useState(false);
  const suppressNextBackdropCloseRef = React.useRef(false);

  React.useEffect(() => {
    if (!isCompactFilters && filtersModalVisible) {
      setFiltersModalVisible(false);
    }
  }, [filtersModalVisible, isCompactFilters]);

  const markModalInteractionStart = () => {
    suppressNextBackdropCloseRef.current = true;
  };
  const markModalInteractionEnd = () => {
    suppressNextBackdropCloseRef.current = false;
  };
  const modalContentGuardProps =
    Platform.OS === 'web'
      ? ({
          onMouseDownCapture: markModalInteractionStart,
          onMouseDown: markModalInteractionStart,
          onTouchStart: markModalInteractionStart,
          onMouseUp: markModalInteractionEnd,
          onTouchEnd: markModalInteractionEnd,
          onStartShouldSetResponderCapture: () => {
            markModalInteractionStart();
            return false;
          },
          onClick: (event: any) => {
            event.stopPropagation?.();
            markModalInteractionEnd();
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

  const closeFiltersModal = () => {
    setFiltersModalVisible(false);
  };

  const handleBackdropPress = () => {
    if (suppressNextBackdropCloseRef.current) {
      suppressNextBackdropCloseRef.current = false;
      return;
    }
    closeFiltersModal();
  };

  const handlePeriodChange = (value: PeriodPreset | 'custom') => {
    if (value === 'custom') {
      closeFiltersModal();
    }
    onPeriodSelect(value);
  };

  const filterIconBtnStyle = (state: any) => [
    styles.filtersIconBtn,
    state?.hovered && styles.filtersIconBtnHover,
    state?.pressed && styles.filtersIconBtnPressed,
  ];
  const tabIconBtnStyle = (state: any) => [
    styles.tabIconBtn,
    state?.hovered && styles.tabIconBtnHover,
    state?.pressed && styles.tabIconBtnPressed,
  ];

  const closeBtnStyle = (state: any) => [
    styles.modalBtnPrimary,
    state?.hovered && styles.modalBtnPrimaryHover,
    state?.pressed && styles.modalBtnPrimaryPressed,
  ];

  const resetBtnStyle = (state: any) => [
    styles.resetFiltersBtn,
    state?.hovered && styles.resetFiltersBtnHover,
    state?.pressed && styles.resetFiltersBtnPressed,
    !canResetFilters && styles.resetFiltersBtnDisabled,
  ];

  const renderFilterFields = (mode: 'default' | 'modal') => {
    const isModalMode = mode === 'modal';
    const wrapStyle = isModalMode ? styles.filtersWrapModal : styles.filtersWrap;
    const filterColStyle = isModalMode ? styles.filterColModal : styles.filterCol;
    const exportColStyle = isModalMode ? styles.exportColModal : styles.exportCol;

    return (
      <View style={wrapStyle}>
        <View style={filterColStyle}>
          <Text style={styles.filterLabel}>Период</Text>
          <Dropdown
            value={periodPreset}
            onChange={(value) => handlePeriodChange(value)}
            items={[
              { label: 'Весь период', value: 'all' },
              { label: 'Последние 7 дней', value: '7' },
              { label: 'Последние 30 дней', value: '30' },
              { label: 'Последние 90 дней', value: '90' },
              { label: 'Указать от/до', value: 'custom' },
            ]}
            placeholder={periodLabel}
          />
        </View>

        <View style={filterColStyle}>
          <Text style={styles.filterLabel}>Отдел</Text>
          <Dropdown
            value={departmentId == null ? 'all' : String(departmentId)}
            onChange={(value) => onDepartmentChange(value === 'all' ? undefined : Number(value))}
            items={[
              { label: 'Все отделы', value: 'all' },
              ...((meta?.availableDepartments || []).map((dep) => ({ label: dep.name, value: String(dep.id) }))),
            ]}
          />
        </View>

        <View style={filterColStyle}>
          <Text style={styles.filterLabel}>Исполнитель</Text>
          <Dropdown
            value={assigneeUserId == null ? 'all' : String(assigneeUserId)}
            onChange={(value) => onAssigneeChange(value === 'all' ? undefined : Number(value))}
            items={[
              { label: 'Все исполнители', value: 'all' },
              ...((meta?.availableAssignees || []).map((user) => ({
                label: `${personName(user)}${user.department?.name ? ` • ${user.department.name}` : ''}`,
                value: String(user.id),
              }))),
            ]}
          />
        </View>

        <View style={filterColStyle}>
          <Text style={styles.filterLabel}>Статус обращения</Text>
          <Dropdown
            value={status ?? 'all'}
            onChange={(value) => onStatusChange(value === 'all' ? undefined : (value as AppealStatus))}
            items={[
              { label: 'Все статусы', value: 'all' },
              { label: 'Открыто', value: 'OPEN' },
              { label: 'В работе', value: 'IN_PROGRESS' },
              { label: 'Ожидание подтверждения', value: 'RESOLVED' },
              { label: 'Завершено', value: 'COMPLETED' },
              { label: 'Отклонено', value: 'DECLINED' },
            ]}
          />
        </View>

        {tab === 'appeals' ? (
          <View style={filterColStyle}>
            <Text style={styles.filterLabel}>Состояние оплаты</Text>
            <Dropdown
              value={paymentState ?? 'all'}
              onChange={(value) => onPaymentStateChange(value === 'all' ? undefined : (value as PaymentStateFilter))}
              items={[
                { label: 'Все состояния оплаты', value: 'all' },
                { label: 'Оплачено', value: 'PAID' },
                { label: 'Не оплачено', value: 'UNPAID' },
                { label: 'Не установлено', value: 'UNSET' },
              ]}
            />
          </View>
        ) : null}

        <View style={exportColStyle}>
          <Text style={styles.filterLabel}>Экспорт</Text>
          <Dropdown
            value=""
            onChange={(value) => onExport(value as 'csv' | 'xlsx')}
            placeholder={exportBusy ? 'Экспорт...' : 'Выбрать формат'}
            items={[
              { label: exportBusy ? 'Экспорт...' : 'CSV', value: 'csv' },
              { label: exportBusy ? 'Экспорт...' : 'XLSX', value: 'xlsx' },
            ]}
          />
        </View>

        <View style={isModalMode ? styles.resetColModal : styles.resetCol}>
          <Text style={styles.filterLabel}>Фильтры</Text>
          <Pressable onPress={onResetFilters} disabled={!canResetFilters} style={resetBtnStyle}>
            <Ionicons name="refresh-outline" size={15} color="#1D4ED8" />
            <Text style={styles.resetFiltersBtnText}>Сбросить</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.toolbarCard}>
      <View style={styles.tabRow}>
        <Pressable onPress={() => onTabChange('appeals')} style={[styles.tabBtn, tab === 'appeals' && styles.tabBtnActive]}>
          <Text style={[styles.tabText, tab === 'appeals' && styles.tabTextActive]}>Обращения</Text>
        </Pressable>
        <Pressable onPress={() => onTabChange('users')} style={[styles.tabBtn, tab === 'users' && styles.tabBtnActive]}>
          <Text style={[styles.tabText, tab === 'users' && styles.tabTextActive]}>Исполнители</Text>
        </Pressable>
        {showKpiShortcut && onOpenKpiShortcut ? (
          <Pressable
            onPress={onOpenKpiShortcut}
            style={tabIconBtnStyle}
            accessibilityRole="button"
            accessibilityLabel="Показать KPI"
          >
            <Ionicons name="bar-chart-outline" size={18} color="#1D4ED8" />
          </Pressable>
        ) : null}
      </View>

      {isCompactFilters ? (
        <>
          <View style={styles.searchFiltersRowCompact}>
            <View style={styles.searchColCompact}>
              <Text style={styles.filterLabel}>Поиск по всем значениям</Text>
              <TextInput
                value={searchInput}
                onChangeText={onSearchInputChange}
                style={styles.searchInput}
                placeholder="Номер, название, отдел, исполнитель, статус"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <Pressable
              onPress={() => setFiltersModalVisible(true)}
              style={filterIconBtnStyle}
              accessibilityRole="button"
              accessibilityLabel="Открыть фильтры"
            >
              <Ionicons name="filter-outline" size={18} color="#1D4ED8" />
            </Pressable>
            <Pressable
              onPress={onResetFilters}
              disabled={!canResetFilters}
              style={resetBtnStyle}
              accessibilityRole="button"
              accessibilityLabel="Сбросить фильтры"
            >
              <Ionicons name="refresh-outline" size={18} color="#1D4ED8" />
            </Pressable>
          </View>

          <Modal visible={filtersModalVisible} transparent animationType="fade" onRequestClose={closeFiltersModal}>
            <Pressable style={styles.modalBackdrop} onPress={handleBackdropPress}>
              <View style={[styles.filterModalCard, Platform.OS === 'web' && styles.webDefaultCursor]} {...modalContentGuardProps}>
                <Text style={styles.modalTitle}>Фильтры аналитики</Text>
                <ScrollView style={styles.filterModalScroll} contentContainerStyle={styles.filterModalContent}>
                  {renderFilterFields('modal')}
                </ScrollView>
                <View style={styles.modalActions}>
                  <Pressable style={closeBtnStyle} onPress={closeFiltersModal}>
                    <Text style={styles.modalBtnPrimaryText}>Готово</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Modal>
        </>
      ) : (
        <View style={styles.filtersWrap}>
          <View style={styles.filterCol}>
            <Text style={styles.filterLabel}>Период</Text>
            <Dropdown
              value={periodPreset}
              onChange={(value) => onPeriodSelect(value)}
              items={[
                { label: 'Весь период', value: 'all' },
                { label: 'Последние 7 дней', value: '7' },
                { label: 'Последние 30 дней', value: '30' },
                { label: 'Последние 90 дней', value: '90' },
                { label: 'Указать от/до', value: 'custom' },
              ]}
              placeholder={periodLabel}
            />
          </View>

          <View style={styles.filterCol}>
            <Text style={styles.filterLabel}>Отдел</Text>
            <Dropdown
              value={departmentId == null ? 'all' : String(departmentId)}
              onChange={(value) => onDepartmentChange(value === 'all' ? undefined : Number(value))}
              items={[
                { label: 'Все отделы', value: 'all' },
                ...((meta?.availableDepartments || []).map((dep) => ({ label: dep.name, value: String(dep.id) }))),
              ]}
            />
          </View>

          <View style={styles.filterCol}>
            <Text style={styles.filterLabel}>Исполнитель</Text>
            <Dropdown
              value={assigneeUserId == null ? 'all' : String(assigneeUserId)}
              onChange={(value) => onAssigneeChange(value === 'all' ? undefined : Number(value))}
              items={[
                { label: 'Все исполнители', value: 'all' },
                ...((meta?.availableAssignees || []).map((user) => ({
                  label: `${personName(user)}${user.department?.name ? ` • ${user.department.name}` : ''}`,
                  value: String(user.id),
                }))),
              ]}
            />
          </View>

          <View style={styles.filterCol}>
            <Text style={styles.filterLabel}>Статус обращения</Text>
            <Dropdown
              value={status ?? 'all'}
              onChange={(value) => onStatusChange(value === 'all' ? undefined : (value as AppealStatus))}
              items={[
                { label: 'Все статусы', value: 'all' },
                { label: 'Открыто', value: 'OPEN' },
                { label: 'В работе', value: 'IN_PROGRESS' },
                { label: 'Ожидание подтверждения', value: 'RESOLVED' },
                { label: 'Завершено', value: 'COMPLETED' },
                { label: 'Отклонено', value: 'DECLINED' },
              ]}
            />
          </View>

          {tab === 'appeals' ? (
            <View style={styles.filterCol}>
              <Text style={styles.filterLabel}>Состояние оплаты</Text>
              <Dropdown
                value={paymentState ?? 'all'}
                onChange={(value) => onPaymentStateChange(value === 'all' ? undefined : (value as PaymentStateFilter))}
                items={[
                  { label: 'Все состояния оплаты', value: 'all' },
                  { label: 'Оплачено', value: 'PAID' },
                  { label: 'Не оплачено', value: 'UNPAID' },
                  { label: 'Не установлено', value: 'UNSET' },
                ]}
              />
            </View>
          ) : null}

          <View style={styles.searchCol}>
            <Text style={styles.filterLabel}>Поиск по всем значениям</Text>
            <TextInput
              value={searchInput}
              onChangeText={onSearchInputChange}
              style={styles.searchInput}
              placeholder="Номер, название, отдел, исполнитель, статус"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.exportCol}>
            <Text style={styles.filterLabel}>Экспорт</Text>
            <Dropdown
              value=""
              onChange={(value) => onExport(value as 'csv' | 'xlsx')}
              placeholder={exportBusy ? 'Экспорт...' : 'Выбрать формат'}
              items={[
                { label: exportBusy ? 'Экспорт...' : 'CSV', value: 'csv' },
                { label: exportBusy ? 'Экспорт...' : 'XLSX', value: 'xlsx' },
              ]}
            />
          </View>
        </View>
      )}

      <Text style={styles.metaText}>{tab === 'appeals' ? `Всего обращений: ${appealsTotal}` : `Исполнителей: ${usersTotal}`}</Text>
    </View>
  );
}
