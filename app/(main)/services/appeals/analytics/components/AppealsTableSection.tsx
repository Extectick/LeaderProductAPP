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
import type {
  AppealsAnalyticsAppealItem,
  AppealsKpiDashboardResponse,
} from '@/src/entities/appeal/types';
import { analyticsStyles as styles } from '../styles';
import {
  type AppealDeadlineTone,
  appealStatusLabel,
  formatHoursValue,
  formatRub,
  formatHoursByMs,
  getAppealDeadlineMeta,
  laborSummaryText,
} from '../helpers';

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
}: Props) {
  const { width: viewportWidth } = useWindowDimensions();
  const isCompactWeb = viewportWidth < 720;
  const isMobileWeb = Platform.OS === 'web' && viewportWidth < 920;
  const stopModalClose = (event: any) => {
    event.stopPropagation?.();
  };

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
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderText, styles.colNumber]}>№</Text>
                    <Text style={[styles.tableHeaderText, styles.colTitle]}>Обращение</Text>
                    <Text style={[styles.tableHeaderText, styles.colStatus]}>Статус</Text>
                    <Text style={[styles.tableHeaderText, styles.colDepartment]}>Отдел</Text>
                    <Text style={[styles.tableHeaderText, styles.colDeadline]}>Дедлайн</Text>
                    <Text style={[styles.tableHeaderText, styles.colSla]}>Открыто</Text>
                    <Text style={[styles.tableHeaderText, styles.colSla]}>В работе</Text>
                    <Text style={[styles.tableHeaderText, styles.colSla]}>До взятия</Text>
                    <Text style={[styles.tableHeaderText, styles.colSla]}>До решения</Text>
                    <Text style={[styles.tableHeaderText, styles.colLabor]}>Исполнители / часы / выплаты</Text>
                  </View>
                </View>
              }
              renderItem={({ item }) => {
                const deadlineMeta = getAppealDeadlineMeta(item);

                return (
                  <Pressable
                    onPress={() => onOpenActions(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Открыть обращение #${item.number}`}
                    style={(state: any) => [
                      styles.tableRow,
                      state?.hovered && styles.tableRowHover,
                      state?.pressed && styles.tableRowPressed,
                    ]}
                  >
                    <Text style={[styles.tableCellText, styles.colNumber]}>#{item.number}</Text>
                    <Text style={[styles.tableCellText, styles.colTitle]}>{item.title || 'Без названия'}</Text>
                    <View style={[styles.colStatus, { justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8 }]}>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>{appealStatusLabel(item.status)}</Text>
                      </View>
                    </View>
                    <Text style={[styles.tableCellText, styles.colDepartment]}>{item.toDepartment.name}</Text>
                    <View style={[styles.colDeadline, styles.deadlineCell]}>
                      <Text style={styles.deadlineDateText}>{deadlineMeta.deadlineText}</Text>
                      {deadlineMeta.badgeText ? (
                        <View style={[styles.deadlineBadge, deadlineBadgeStyle(deadlineMeta.tone)]}>
                          <Text style={[styles.deadlineBadgeText, deadlineBadgeTextStyle(deadlineMeta.tone)]}>
                            {deadlineMeta.badgeText}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.tableCellText, styles.colSla]}>{formatHoursByMs(item.sla.openDurationMs)}</Text>
                    <Text style={[styles.tableCellText, styles.colSla]}>{formatHoursByMs(item.sla.workDurationMs)}</Text>
                    <Text style={[styles.tableCellText, styles.colSla]}>{formatHoursByMs(item.sla.timeToFirstInProgressMs)}</Text>
                    <Text style={[styles.tableCellText, styles.colSla]}>{formatHoursByMs(item.sla.timeToFirstResolvedMs)}</Text>
                    <Text style={[styles.tableCellText, styles.colLabor]}>{laborSummaryText(item)}</Text>
                  </Pressable>
                );
              }}
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

      {refreshLoading && appeals.length > 0 ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.overlayText}>Обновление списка...</Text>
        </View>
      ) : null}
    </View>
  );
}
