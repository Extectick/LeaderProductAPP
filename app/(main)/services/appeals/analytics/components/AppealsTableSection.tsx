import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  AppealsAnalyticsAppealItem,
  AppealsKpiDashboardResponse,
  AppealStatus,
} from '@/src/entities/appeal/types';
import { analyticsStyles as styles } from '../styles';
import {
  type AppealDeadlineTone,
  appealStatusLabel,
  buildAppealLaborMultilineColumns,
  formatHoursValue,
  formatRub,
  formatHoursByMs,
  getAppealDeadlineMeta,
} from '../helpers';
import {
  APPEALS_ANALYTICS_ALL_COLUMNS,
  APPEALS_ANALYTICS_COLUMN_LABELS,
  APPEALS_ANALYTICS_LOCKED_COLUMNS,
  type TableColumnKey,
} from '../types';

const COLUMN_WIDTHS: Record<TableColumnKey, number> = {
  number: 74,
  title: 220,
  status: 170,
  department: 180,
  deadline: 190,
  slaOpen: 130,
  slaWork: 130,
  slaToTake: 130,
  slaToResolve: 130,
  assignees: 220,
  hoursAccrued: 150,
  hoursPaid: 150,
  hoursRemaining: 150,
  hourlyRate: 160,
  amountAccrued: 170,
  amountPaid: 170,
  amountRemaining: 170,
};

type Props = {
  appeals: AppealsAnalyticsAppealItem[];
  initialLoading: boolean;
  refreshLoading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  kpiDashboard: AppealsKpiDashboardResponse | null;
  loadingKpi: boolean;
  kpiModalVisible: boolean;
  onCloseKpiModal: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onOpenActions: (appealId: number) => void;
  visibleColumns: TableColumnKey[];
  onChangeVisibleColumns: (columns: TableColumnKey[]) => void;
  onResetVisibleColumns: () => void;
};

export function AppealsTableSection({
  appeals,
  initialLoading,
  refreshLoading,
  loadingMore,
  hasMore,
  kpiDashboard,
  loadingKpi,
  kpiModalVisible,
  onCloseKpiModal,
  onRefresh,
  onLoadMore,
  onOpenActions,
  visibleColumns,
  onChangeVisibleColumns,
  onResetVisibleColumns,
}: Props) {
  const { width: viewportWidth } = useWindowDimensions();
  const isCompactWeb = viewportWidth < 720;
  const isMobileWeb = Platform.OS === 'web' && viewportWidth < 920;
  const [columnsModalVisible, setColumnsModalVisible] = React.useState(false);
  const stopModalClose = (event: any) => {
    event.stopPropagation?.();
  };

  const lockedColumns = React.useMemo(() => new Set<TableColumnKey>(APPEALS_ANALYTICS_LOCKED_COLUMNS), []);

  const normalizedVisibleColumns = React.useMemo(() => {
    const selected = new Set<TableColumnKey>(visibleColumns);
    for (const key of APPEALS_ANALYTICS_LOCKED_COLUMNS) selected.add(key);
    return APPEALS_ANALYTICS_ALL_COLUMNS.filter((key) => selected.has(key));
  }, [visibleColumns]);

  const tableMinWidth = React.useMemo(
    () => normalizedVisibleColumns.reduce((sum, key) => sum + COLUMN_WIDTHS[key], 0),
    [normalizedVisibleColumns]
  );

  const deadlineBadgeStyle = (tone: AppealDeadlineTone) => {
    if (tone === 'overdue') return styles.deadlineBadgeOverdue;
    if (tone === 'soon') return styles.deadlineBadgeSoon;
    if (tone === 'onTimeCompleted') return styles.deadlineBadgeOnTimeCompleted;
    return styles.deadlineBadgeNeutral;
  };

  const deadlineBadgeTextStyle = (tone: AppealDeadlineTone) => {
    if (tone === 'overdue') return styles.deadlineBadgeTextOverdue;
    if (tone === 'soon') return styles.deadlineBadgeTextSoon;
    if (tone === 'onTimeCompleted') return styles.deadlineBadgeTextOnTimeCompleted;
    return styles.deadlineBadgeTextNeutral;
  };

  const statusBadgeStyle = (status: AppealStatus) => {
    if (status === 'IN_PROGRESS') return styles.statusBadgeInProgress;
    if (status === 'RESOLVED') return styles.statusBadgeResolved;
    if (status === 'COMPLETED') return styles.statusBadgeCompleted;
    if (status === 'DECLINED') return styles.statusBadgeDeclined;
    return styles.statusBadgeOpen;
  };

  const statusBadgeTextStyle = (status: AppealStatus) => {
    if (status === 'IN_PROGRESS') return styles.statusBadgeTextInProgress;
    if (status === 'RESOLVED') return styles.statusBadgeTextResolved;
    if (status === 'COMPLETED') return styles.statusBadgeTextCompleted;
    if (status === 'DECLINED') return styles.statusBadgeTextDeclined;
    return styles.statusBadgeTextOpen;
  };

  const headerCellStyle = React.useCallback((column: TableColumnKey) => {
    return [styles.tableHeaderText, { width: COLUMN_WIDTHS[column] }];
  }, []);

  const cellTextStyle = React.useCallback((column: TableColumnKey, multiline = false) => {
    return [styles.tableCellText, multiline && styles.tableCellTextMultiline, { width: COLUMN_WIDTHS[column] }];
  }, []);

  const toggleColumn = React.useCallback(
    (key: TableColumnKey) => {
      if (lockedColumns.has(key)) return;
      const next = new Set<TableColumnKey>(normalizedVisibleColumns);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      for (const col of APPEALS_ANALYTICS_LOCKED_COLUMNS) next.add(col);
      onChangeVisibleColumns(APPEALS_ANALYTICS_ALL_COLUMNS.filter((col) => next.has(col)));
    },
    [lockedColumns, normalizedVisibleColumns, onChangeVisibleColumns]
  );

  const renderKpiMetric = (label: string, value: string | number) => (
    <View style={styles.kpiMetricRow}>
      <Text style={styles.kpiMetricLabel}>{label}</Text>
      {loadingKpi ? (
        <ActivityIndicator size="small" color="#2563EB" />
      ) : (
        <Text style={styles.kpiMetricValue}>{String(value)}</Text>
      )}
    </View>
  );

  const renderKpiCards = () => (
    <View style={[styles.kpiGrid, isCompactWeb && styles.kpiGridCompact]}>
      <View style={styles.kpiCard}>
        <Text style={styles.kpiCardTitle}>Статусы обращений</Text>
        {renderKpiMetric('Всего', kpiDashboard?.appeals.totalCount ?? 0)}
        {renderKpiMetric('Открыто', kpiDashboard?.appeals.openCount ?? 0)}
        {renderKpiMetric('В работе', kpiDashboard?.appeals.inProgressCount ?? 0)}
        {renderKpiMetric('Завершено', kpiDashboard?.appeals.completedCount ?? 0)}
      </View>
      <View style={styles.kpiCard}>
        <Text style={styles.kpiCardTitle}>Время</Text>
        {renderKpiMetric('Среднее до взятия', formatHoursByMs(kpiDashboard?.timing.avgTakeMs))}
        {renderKpiMetric('Среднее выполнения', formatHoursByMs(kpiDashboard?.timing.avgExecutionMs))}
        {renderKpiMetric('Количество взятий', kpiDashboard?.timing.takeCount ?? 0)}
        {renderKpiMetric('Количество выполнений', kpiDashboard?.timing.executionCount ?? 0)}
      </View>
      <View style={styles.kpiCard}>
        <Text style={styles.kpiCardTitle}>Часы и выплаты (RUB)</Text>
        {renderKpiMetric(
          'Начислено',
          `${formatHoursValue(kpiDashboard?.labor.totalAccruedHours)} / ${formatRub(kpiDashboard?.labor.totalAccruedAmountRub)}`
        )}
        {renderKpiMetric(
          'Оплачено',
          `${formatHoursValue(kpiDashboard?.labor.totalPaidHours)} / ${formatRub(kpiDashboard?.labor.totalPaidAmountRub)}`
        )}
        {renderKpiMetric(
          'К доплате',
          `${formatHoursValue(kpiDashboard?.labor.totalRemainingHours)} / ${formatRub(kpiDashboard?.labor.totalRemainingAmountRub)}`
        )}
        {renderKpiMetric('Не требует оплаты', formatHoursValue(kpiDashboard?.labor.totalNotRequiredHours))}
      </View>
    </View>
  );

  const renderCell = React.useCallback(
    (item: AppealsAnalyticsAppealItem, key: TableColumnKey) => {
      if (key === 'number') return <Text style={cellTextStyle(key)}>#{item.number}</Text>;
      if (key === 'title') return <Text style={cellTextStyle(key)}>{item.title || 'Без названия'}</Text>;
      if (key === 'status') {
        return (
          <View style={[{ width: COLUMN_WIDTHS.status, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8 }]}>
            <View style={[styles.statusBadge, statusBadgeStyle(item.status)]}>
              <Text style={[styles.statusBadgeText, statusBadgeTextStyle(item.status)]}>{appealStatusLabel(item.status)}</Text>
            </View>
          </View>
        );
      }
      if (key === 'department') return <Text style={cellTextStyle(key)}>{item.toDepartment.name}</Text>;
      if (key === 'deadline') {
        const deadlineMeta = getAppealDeadlineMeta(item);
        return (
          <View style={[{ width: COLUMN_WIDTHS.deadline }, styles.deadlineCell]}>
            <Text style={styles.deadlineDateText}>{deadlineMeta.deadlineText}</Text>
            {deadlineMeta.badgeText ? (
              <View style={[styles.deadlineBadge, deadlineBadgeStyle(deadlineMeta.tone)]}>
                <Text style={[styles.deadlineBadgeText, deadlineBadgeTextStyle(deadlineMeta.tone)]}>
                  {deadlineMeta.badgeText}
                </Text>
              </View>
            ) : null}
          </View>
        );
      }
      if (key === 'slaOpen') return <Text style={cellTextStyle(key)}>{formatHoursByMs(item.sla.openDurationMs)}</Text>;
      if (key === 'slaWork') return <Text style={cellTextStyle(key)}>{formatHoursByMs(item.sla.workDurationMs)}</Text>;
      if (key === 'slaToTake') {
        return <Text style={cellTextStyle(key)}>{formatHoursByMs(item.sla.timeToFirstInProgressMs)}</Text>;
      }
      if (key === 'slaToResolve') {
        return <Text style={cellTextStyle(key)}>{formatHoursByMs(item.sla.timeToFirstResolvedMs)}</Text>;
      }
      const laborMultiline = buildAppealLaborMultilineColumns(item);
      return <Text style={cellTextStyle(key, true)}>{laborMultiline[key]}</Text>;
    },
    [cellTextStyle]
  );

  if (initialLoading && appeals.length === 0) {
    return (
      <View style={styles.loadingCard}>
        <ActivityIndicator size="small" color="#2563EB" />
        <Text style={styles.loadingText}>Загрузка списка обращений...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {!isMobileWeb ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>KPI обращения и выплаты</Text>
          {renderKpiCards()}
        </View>
      ) : null}

      <View style={styles.tableWrap}>
        <View style={styles.tableTopActions}>
          <Pressable
            onPress={() => setColumnsModalVisible(true)}
            style={(state: any) => [
              styles.columnVisibilityBtn,
              state?.hovered && styles.columnVisibilityBtnHover,
              state?.pressed && styles.columnVisibilityBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Настроить колонки таблицы"
          >
            <Ionicons name="eye-outline" size={18} color="#1D4ED8" />
          </Pressable>
        </View>
        <ScrollView
          horizontal
          style={[styles.tableHorizontalScroll, isMobileWeb && styles.tableHorizontalScrollMobileWeb]}
          contentContainerStyle={styles.tableHorizontalContent}
          showsHorizontalScrollIndicator
          persistentScrollbar={isMobileWeb}
          bounces={false}
        >
          <View style={styles.tableScrollableContent}>
            <FlatList
              style={[styles.tableList, isMobileWeb && styles.tableListMobileWeb]}
              data={appeals}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.tableListContent}
              stickyHeaderIndices={[0]}
              refreshControl={<RefreshControl refreshing={refreshLoading && !initialLoading} onRefresh={onRefresh} />}
              showsVerticalScrollIndicator
              persistentScrollbar={isMobileWeb}
              onEndReachedThreshold={0.35}
              onEndReached={() => {
                if (loadingMore || refreshLoading || initialLoading || !hasMore) return;
                onLoadMore();
              }}
              ListHeaderComponent={
                <View style={styles.tableStickyHeaderWrap}>
                  <View style={[styles.tableHeader, { minWidth: tableMinWidth }]}>
                    {normalizedVisibleColumns.map((key) => (
                      <Text key={key} style={headerCellStyle(key)}>
                        {APPEALS_ANALYTICS_COLUMN_LABELS[key]}
                      </Text>
                    ))}
                  </View>
                </View>
              }
              renderItem={({ item }) => (
                (() => {
                  const assigneesCount = Math.max(1, item.assignees?.length || 0);
                  const rowMinHeight = assigneesCount > 1 ? 42 + (assigneesCount - 1) * 18 : undefined;
                  return (
                    <Pressable
                      onPress={() => onOpenActions(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Открыть обращение #${item.number}`}
                      style={(state: any) => [
                        styles.tableRow,
                        { minWidth: tableMinWidth, minHeight: rowMinHeight },
                        state?.hovered && styles.tableRowHover,
                        state?.pressed && styles.tableRowPressed,
                      ]}
                    >
                      {normalizedVisibleColumns.map((key) => (
                        <View key={`${item.id}-${key}`}>{renderCell(item, key)}</View>
                      ))}
                    </Pressable>
                  );
                })()
              )}
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color="#2563EB" />
                  </View>
                ) : null
              }
            />
          </View>
        </ScrollView>
      </View>

      <Modal visible={kpiModalVisible} transparent animationType="fade" onRequestClose={onCloseKpiModal}>
        <Pressable style={styles.modalBackdrop} onPress={onCloseKpiModal}>
          <Pressable
            style={[styles.kpiModalCard, Platform.OS === 'web' && styles.webDefaultCursor]}
            onPress={stopModalClose}
          >
            <Text style={styles.modalTitle}>KPI обращения и выплаты</Text>
            <ScrollView style={styles.kpiModalScroll} contentContainerStyle={styles.kpiModalContent}>
              {renderKpiCards()}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={onCloseKpiModal}
                style={(state: any) => [
                  styles.modalBtnPrimary,
                  state?.hovered && styles.modalBtnPrimaryHover,
                  state?.pressed && styles.modalBtnPrimaryPressed,
                ]}
              >
                <Text style={styles.modalBtnPrimaryText}>Закрыть</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={columnsModalVisible} transparent animationType="fade" onRequestClose={() => setColumnsModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setColumnsModalVisible(false)}>
          <Pressable style={[styles.modalCard, Platform.OS === 'web' && styles.webDefaultCursor]} onPress={stopModalClose}>
            <Text style={styles.modalTitle}>Видимость столбцов</Text>
            <ScrollView style={styles.columnsModalScroll} contentContainerStyle={styles.columnsModalContent}>
              {APPEALS_ANALYTICS_ALL_COLUMNS.map((key) => {
                const isLocked = lockedColumns.has(key);
                const isSelected = normalizedVisibleColumns.includes(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggleColumn(key)}
                    disabled={isLocked}
                    style={(state: any) => [
                      styles.columnToggleRow,
                      state?.hovered && !isLocked && styles.columnToggleRowHover,
                      isLocked && styles.columnToggleRowLocked,
                    ]}
                  >
                    <View style={[styles.columnToggleCheckbox, isSelected && styles.columnToggleCheckboxActive]}>
                      {isSelected ? <Ionicons name="checkmark" size={14} color="#1D4ED8" /> : null}
                    </View>
                    <Text style={[styles.columnToggleLabel, isLocked && styles.columnToggleLabelLocked]}>
                      {APPEALS_ANALYTICS_COLUMN_LABELS[key]}
                      {isLocked ? ' (фиксировано)' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={onResetVisibleColumns}
                style={(state: any) => [
                  styles.modalBtnSecondary,
                  state?.hovered && styles.modalBtnSecondaryHover,
                  state?.pressed && styles.modalBtnSecondaryPressed,
                ]}
              >
                <Text style={styles.modalBtnSecondaryText}>Показать все</Text>
              </Pressable>
              <Pressable
                onPress={() => setColumnsModalVisible(false)}
                style={(state: any) => [
                  styles.modalBtnPrimary,
                  state?.hovered && styles.modalBtnPrimaryHover,
                  state?.pressed && styles.modalBtnPrimaryPressed,
                ]}
              >
                <Text style={styles.modalBtnPrimaryText}>Готово</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {refreshLoading && appeals.length > 0 ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.overlayText}>Обновление списка...</Text>
        </View>
      ) : null}
    </View>
  );
}
