import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import SvgChart, { SVGRenderer } from '@wuba/react-native-echarts/svgChart';
import { PieChart } from 'echarts/charts';
import * as echarts from 'echarts/core';
import type { EChartsType } from 'echarts/core';
import type { CounterpartyCardBootstrap, CounterpartyFinancialDocument, CounterpartyFinancialDocumentStatus, CounterpartySalesPeriod } from '../../model/counterpartyCard.types';
import { formatCounterpartyDate, formatCounterpartyMoney } from '../../model/counterpartyCard.formatters';
import { CounterpartyFinanceSkeleton, SectionCard, SectionUnavailable } from '../CounterpartyCardPrimitives';
import { CounterpartyPeriodSelector, type CounterpartyPeriodRange } from '../CounterpartyPeriodSelector';
import { InfoIcon } from '../MetricInfoDialog';
import { useCounterpartyFinancialDocuments } from '../../hooks/useCounterpartyFinancialDocuments';

const FINANCE_CHART_SIZE = 206;

echarts.use([PieChart, SVGRenderer]);

type DocumentFilter = 'ALL' | CounterpartyFinancialDocumentStatus;
const FILTERS: Array<{ key: DocumentFilter; label: string }> = [
  { key: 'ALL', label: 'Все' },
  { key: 'OVERDUE', label: 'Просрочено' },
  { key: 'EXPECTED', label: 'Ожидается' },
  { key: 'AWAITING_SHIPMENT', label: 'Ждут отгрузки' },
  { key: 'PAID', label: 'Оплачено' },
];

function PaymentTermFact({ icon, label, value, secondary, tone = 'normal' }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; value: string; secondary?: string | null; tone?: 'normal' | 'danger' | 'success' }) {
  return <View style={styles.termFact}><View style={styles.termFactHeader}><MaterialCommunityIcons name={icon} size={23} color={tone === 'danger' ? '#DC2626' : tone === 'success' ? '#0F9F6E' : '#2563EB'} /><Text style={styles.termFactLabel}>{label}</Text><InfoIcon title={label} /></View><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.termFactValue, tone === 'danger' && styles.danger, tone === 'success' && styles.success]}>{value}</Text>{secondary ? <Text numberOfLines={1} style={styles.termFactSecondary}>{secondary}</Text> : null}</View>;
}

type FinanceSegment = { key: string; label: string; value: number; color: string };

function EChartsFinanceDonut({ segments, selectedKey, onSelect }: { segments: FinanceSegment[]; selectedKey: string | null; onSelect: (key: string) => void }) {
  const chartRef = React.useRef<any>(null);
  const chartInstanceRef = React.useRef<EChartsType | null>(null);
  const onSelectRef = React.useRef(onSelect);
  const renderedRef = React.useRef(false);

  React.useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  React.useEffect(() => {
    if (!chartRef.current) return;
    const chart: EChartsType = echarts.init(chartRef.current, undefined, {
      renderer: 'svg',
      width: FINANCE_CHART_SIZE,
      height: FINANCE_CHART_SIZE,
    });
    chartInstanceRef.current = chart;
    const handleClick = (params: any) => {
      if (params.data?.key) onSelectRef.current(params.data.key);
    };
    chart.on('click', handleClick);
    return () => {
      chart.off('click', handleClick);
      chart.dispose();
      chartInstanceRef.current = null;
      renderedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    const visible = segments.filter((segment) => segment.value > 0);
    const firstRender = !renderedRef.current;
    chart.setOption({
      animation: firstRender,
      animationDuration: firstRender ? 320 : 0,
      animationDurationUpdate: 0,
      animationEasing: 'cubicOut',
      series: [{
        type: 'pie',
        radius: ['66%', '88%'],
        center: ['50%', '50%'],
        startAngle: 90,
        clockwise: true,
        selectedMode: 'single',
        selectedOffset: 6,
        padAngle: visible.length > 1 ? 1.5 : 0,
        label: { show: false },
        labelLine: { show: false },
        silent: visible.length === 0,
        itemStyle: { borderColor: '#FFFFFF', borderWidth: 2, borderRadius: 5 },
        emphasis: { scale: true, scaleSize: 4 },
        data: visible.length
          ? visible.map((segment) => {
            const selected = segment.key === selectedKey;
            const dimmed = Boolean(selectedKey) && !selected;
            return {
              ...segment,
              name: segment.label,
              selected,
              itemStyle: {
                color: segment.color,
                opacity: dimmed ? 0.35 : 1,
                borderColor: selected ? '#334155' : '#FFFFFF',
                borderWidth: selected ? 3 : 2,
                shadowBlur: selected ? 7 : 0,
                shadowColor: selected ? 'rgba(15,23,42,0.32)' : 'transparent',
              },
            };
          })
          : [{ value: 1, name: 'Нет данных', itemStyle: { color: '#E8EEF6' } }],
      }],
    }, { notMerge: true, lazyUpdate: false });
    renderedRef.current = true;
  }, [segments, selectedKey]);

  return <SvgChart ref={chartRef} style={{ width: FINANCE_CHART_SIZE, height: FINANCE_CHART_SIZE }} />;
}

function FinanceDonut({ paid, debt, overdue, prepayment, currency }: { paid: number | null; debt: number | null; overdue: number | null; prepayment: number | null; currency: string }) {
  const paidValue = Math.max(0, paid || 0);
  const overdueValue = Math.max(0, overdue || 0);
  const prepaymentValue = Math.max(0, prepayment || 0);
  const regularDebt = Math.max(0, (debt || 0) - overdueValue);
  const segments = React.useMemo<FinanceSegment[]>(() => [
    { key: 'paid', label: 'Оплачено', value: paidValue, color: '#10B981' },
    { key: 'debt', label: 'Долг', value: regularDebt, color: '#F59E0B' },
    { key: 'overdue', label: 'Просрочено', value: overdueValue, color: '#EF4444' },
    { key: 'prepayment', label: 'Аванс', value: prepaymentValue, color: '#7C3AED' },
  ], [overdueValue, paidValue, prepaymentValue, regularDebt]);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const selectSegment = React.useCallback((key: string) => setSelectedKey(key), []);
  const resetSelection = React.useCallback(() => setSelectedKey(null), []);
  const selected = segments.find((segment) => segment.key === selectedKey);
  const chartTotal = segments.reduce((sum, segment) => sum + segment.value, 0);
  const selectedPercent = selected && chartTotal > 0 ? selected.value / chartTotal * 100 : null;
  const centerLabel = selected?.label || 'Общий долг';
  const centerValue = selected?.value ?? Math.max(0, debt || 0);

  return <View style={styles.diagram}>
    <View style={styles.donutWrap}>
      <EChartsFinanceDonut segments={segments} selectedKey={selectedKey} onSelect={selectSegment} />
      <Pressable accessibilityRole="button" accessibilityLabel={selected ? `Сбросить выбор: ${selected.label}` : 'Выберите сектор диаграммы'} disabled={!selected} onPress={resetSelection} style={({ pressed }) => [styles.donutCenter, selected && styles.donutCenterSelected, pressed && styles.donutCenterPressed]}><Text style={styles.donutCaption}>{centerLabel}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={styles.donutTotal}>{formatCounterpartyMoney(centerValue, currency)}</Text>{selectedPercent != null ? <Text style={styles.donutPercent}>{selectedPercent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% · сбросить</Text> : <Text style={styles.donutHint}>Нажмите сектор</Text>}</Pressable>
    </View>
    <View style={styles.legend}>
      {segments.map((segment) => <LegendItem key={segment.key} color={segment.color} label={segment.label} value={formatCounterpartyMoney(segment.value, currency)} percent={chartTotal > 0 ? segment.value / chartTotal * 100 : 0} selected={segment.key === selectedKey} onPress={() => selectSegment(segment.key)} />)}
    </View>
  </View>;
}

function LegendItem({ color, label, value, percent, selected, onPress }: { color: string; label: string; value: string; percent: number; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.legendItem, selected && styles.legendItemSelected, pressed && styles.legendItemPressed]}><View style={[styles.legendDot, { backgroundColor: color }]} /><View style={styles.legendText}><View style={styles.legendLabelRow}><Text style={[styles.legendLabel, selected && styles.legendLabelSelected]}>{label}</Text><Text style={[styles.legendPercent, selected && styles.legendPercentSelected]}>{percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</Text></View><Text numberOfLines={1} adjustsFontSizeToFit style={styles.legendValue}>{value}</Text></View></Pressable>;
}

function documentStatus(status: CounterpartyFinancialDocumentStatus | null) {
  if (status === 'OVERDUE') return { label: 'Просрочено', icon: 'alert-circle-outline' as const, color: '#DC2626', background: '#FEECEC' };
  if (status === 'AWAITING_SHIPMENT') return { label: 'Ожидает отгрузки', icon: 'truck-fast-outline' as const, color: '#2563EB', background: '#EAF2FF' };
  if (status === 'PAID') return { label: 'Оплачено', icon: 'check-circle-outline' as const, color: '#0F9F6E', background: '#ECFDF5' };
  return { label: 'Ожидается', icon: 'calendar-clock-outline' as const, color: '#D97706', background: '#FFF7E6' };
}

function documentTiming(document: CounterpartyFinancialDocument) {
  if (document.status === 'OVERDUE') return `${document.daysOverdue ?? 0} дн. просрочки`;
  if (document.status === 'AWAITING_SHIPMENT') return document.shipmentDate ? `Отгрузка ${formatCounterpartyDate(document.shipmentDate)}` : 'Дата отгрузки не назначена';
  if (document.status === 'PAID') return 'Оплачен';
  if (document.daysRemaining != null) return `Осталось ${document.daysRemaining} дн.`;
  return document.dueDate ? `Оплата до ${formatCounterpartyDate(document.dueDate)}` : 'Срок оплаты не указан';
}

function legacyDocuments(data: CounterpartyCardBootstrap): CounterpartyFinancialDocument[] {
  if (data.financialDocuments?.length) return data.financialDocuments;
  return (data.upcomingPayments || []).map((item) => ({
    documentGuid: item.guid,
    documentTypeCode: null,
    documentTypeName: 'Документ расчётов',
    number: item.number,
    date: item.date,
    status: item.status,
    dueDate: item.dueDate,
    shipmentDate: null,
    daysOverdue: item.overdueDays,
    daysRemaining: null,
    outstandingAmount: item.amount,
    amount: item.amount,
    currency: item.currency,
    organizationGuid: null,
    organizationName: null,
  }));
}

function FinancialDocumentRow({ document, index }: { document: CounterpartyFinancialDocument; index: number }) {
  const status = documentStatus(document.status);
  const currency = document.currency || 'RUB';
  const partiallyUnpaid = document.status !== 'PAID' && document.status !== 'AWAITING_SHIPMENT' && document.outstandingAmount != null && document.amount != null && document.outstandingAmount !== document.amount;
  return <View style={[styles.documentRow, index > 0 && styles.rowBorder]}>
    <View accessibilityLabel={status.label} style={[styles.documentIcon, { backgroundColor: status.background }]}><MaterialCommunityIcons name={status.icon} size={19} color={status.color} /></View>
    <View style={styles.documentBody}>
      <View style={styles.documentTitleRow}><Text numberOfLines={1} style={styles.documentTitle}>{document.number || document.documentTypeName || 'Документ'}</Text></View>
      <Text numberOfLines={1} style={styles.documentMeta}>{formatCounterpartyDate(document.date)} · {documentTiming(document)}{partiallyUnpaid ? ` · к оплате ${formatCounterpartyMoney(document.outstandingAmount, currency)}` : ''}</Text>
    </View>
    <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.documentAmount, document.status === 'OVERDUE' && styles.danger]}>{formatCounterpartyMoney(document.amount, currency)}</Text>
  </View>;
}

export function CounterpartyFinanceTab({ data, refreshing, loading, onRefresh, onRetry, organizationSelected, renderChart, period, customRange, onPeriodChange, onCustomPeriodApply }: { data: CounterpartyCardBootstrap; refreshing: boolean; loading: boolean; onRefresh: () => void; onRetry: () => void; organizationSelected: boolean; renderChart: boolean; period: CounterpartySalesPeriod; customRange: CounterpartyPeriodRange | null; onPeriodChange: (period: CounterpartySalesPeriod) => void; onCustomPeriodApply: (range: CounterpartyPeriodRange) => void }) {
  const [filter, setFilter] = React.useState<DocumentFilter>('ALL');
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [filterMenu, setFilterMenu] = React.useState({ left: 12, top: 0, width: 220 });
  const filterAnchorRef = React.useRef<View>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const periodFrom = period === 'custom' ? customRange?.from || null : null;
  const periodTo = period === 'custom' ? customRange?.to || null : null;
  const financialDocuments = useCounterpartyFinancialDocuments({
    counterpartyGuid: data.identity.counterpartyGuid,
    organizationGuid: data.context.organizationGuid || '',
    preset: period,
    periodFrom,
    periodTo,
    status: filter === 'ALL' ? null : filter,
  }, renderChart && organizationSelected);
  const finance = data.financeSummary;
  if (!organizationSelected) return <SectionUnavailable organizationRequired />;
  if (data.availability.finance !== 'available' || !finance) return <SectionUnavailable forbidden={data.availability.finance === 'forbidden'} onRetry={data.availability.finance === 'unavailable' ? onRetry : undefined} />;

  const currency = finance.currency || 'RUB';
  const paid = finance.paidAmount ?? data.paymentDiscipline?.totalSettledAmount ?? (data.incomingPayments?.length ? data.incomingPayments.reduce((sum, item) => sum + (item.amount || 0), 0) : null);
  const selectedPeriodFrom = data.salesSummary?.periodFrom || data.paymentDiscipline?.periodFrom;
  const selectedPeriodTo = data.salesSummary?.periodTo || data.paymentDiscipline?.periodTo;
  const paidPeriod = selectedPeriodFrom && selectedPeriodTo ? `${formatCounterpartyDate(selectedPeriodFrom)} — ${formatCounterpartyDate(selectedPeriodTo)}` : null;
  const legacy = legacyDocuments(data);
  const fallbackDocuments = filter === 'ALL' ? legacy : legacy.filter((document) => document.status === filter);
  const documents = financialDocuments.page?.items || fallbackDocuments;
  const summary = financialDocuments.page?.summary || data.financialDocumentsSummary || {
    totalCount: legacy.length,
    overdueCount: legacy.filter((item) => item.status === 'OVERDUE').length,
    pendingCount: legacy.filter((item) => item.status === 'EXPECTED' || item.status === 'OVERDUE').length,
    awaitingShipmentCount: legacy.filter((item) => item.status === 'AWAITING_SHIPMENT').length,
  };
  const paymentTerm = finance.paymentTermDays != null
    ? `${finance.paymentTermDays} дн.`
    : data.commercialTerms?.paymentTerms || '—';
  const agreementName = finance.agreementName || data.commercialTerms?.agreementName;

  const selectFilter = (next: DocumentFilter) => { setFilter(next); setFilterOpen(false); };
  const openFilter = () => {
    filterAnchorRef.current?.measureInWindow((x, y, width, height) => {
      const menuWidth = Math.min(228, screenWidth - 24);
      const estimatedHeight = FILTERS.length * 43 + 10;
      const top = Math.min(y + height + 4, Math.max(12, screenHeight - estimatedHeight - 12));
      setFilterMenu({ left: Math.max(12, Math.min(x + width - menuWidth, screenWidth - menuWidth - 12)), top, width: menuWidth });
      setFilterOpen(true);
    });
  };
  const activeFilter = FILTERS.find((item) => item.key === filter) || FILTERS[0];
  return <ScrollView style={styles.scroll} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
    <CounterpartyPeriodSelector period={period} customRange={customRange} onPeriodChange={onPeriodChange} onCustomPeriodApply={onCustomPeriodApply} />
    {loading ? <CounterpartyFinanceSkeleton contentOnly /> : <>
    <SectionCard title="Финансовое состояние" icon="chart-donut">
      {renderChart ? <FinanceDonut paid={paid} debt={finance.debtTotal} overdue={finance.overdueDebt} prepayment={finance.prepayment} currency={currency} /> : <View style={styles.diagramPlaceholder} />}
      {paidPeriod ? <View style={styles.financePeriod}><MaterialCommunityIcons name="calendar-range" size={19} color="#64748B" /><Text style={styles.financePeriodValue}>{paidPeriod}</Text></View> : null}
    </SectionCard>
    <SectionCard title="Условия оплаты" icon="calendar-check-outline">
      <View style={styles.termsGrid}>
        <PaymentTermFact icon="calendar-arrow-right" label="Ближайший платёж" value={formatCounterpartyMoney(finance.nearestPaymentAmount, currency)} secondary={finance.nearestPaymentDate ? formatCounterpartyDate(finance.nearestPaymentDate) : 'Срок не указан'} tone={finance.overdueDebt && finance.overdueDebt > 0 ? 'danger' : 'normal'} />
        <PaymentTermFact icon="timer-sand" label="Отсрочка" value={paymentTerm} secondary={finance.paymentTermSource === 'AGREEMENT' ? 'По соглашению' : finance.paymentTermSource === 'CONTRACT' ? 'По договору' : null} />
      </View>
      {agreementName ? <View style={styles.agreementRow}><MaterialCommunityIcons name="file-sign" size={20} color="#64748B" /><View style={styles.agreementBody}><Text style={styles.agreementLabel}>Соглашение</Text><Text numberOfLines={2} style={styles.agreementValue}>{agreementName}</Text></View></View> : null}
    </SectionCard>
    <SectionCard title="Финансовые документы" icon="file-document-multiple-outline">
      <View style={styles.documentSummary}>
        <View style={styles.documentSummaryItem}><Text style={styles.documentSummaryValue}>{summary.totalCount}</Text><Text style={styles.documentSummaryLabel}>всего</Text></View>
        <View style={styles.documentSummaryItem}><Text style={[styles.documentSummaryValue, summary.pendingCount > 0 && styles.warning]}>{summary.pendingCount}</Text><Text style={styles.documentSummaryLabel}>к оплате</Text></View>
        <View style={styles.documentSummaryItem}><Text style={[styles.documentSummaryValue, summary.overdueCount > 0 && styles.danger]}>{summary.overdueCount}</Text><Text style={styles.documentSummaryLabel}>просрочено</Text></View>
        {summary.awaitingShipmentCount > 0 ? <View style={styles.documentSummaryItem}><Text style={[styles.documentSummaryValue, styles.info]}>{summary.awaitingShipmentCount}</Text><Text style={styles.documentSummaryLabel}>к отгрузке</Text></View> : null}
      </View>
      <View style={styles.filterControlRow}><Text style={styles.filterControlLabel}>Показывать</Text><View ref={filterAnchorRef} collapsable={false}><Pressable accessibilityRole="button" accessibilityState={{ expanded: filterOpen }} onPress={openFilter} style={({ pressed }) => [styles.filterTrigger, pressed && styles.filterTriggerPressed]}><MaterialCommunityIcons name="filter-variant" size={18} color="#2563EB" /><Text style={styles.filterTriggerText}>{activeFilter.label}</Text><MaterialCommunityIcons name={filterOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" /></Pressable></View></View>
      {financialDocuments.loading && !financialDocuments.page && (filter !== 'ALL' || fallbackDocuments.length === 0) ? <View style={styles.documentsSkeleton}>{[0, 1, 2].map((item) => <View key={item} style={styles.documentSkeletonRow}><View style={styles.documentSkeletonIcon} /><View style={styles.documentSkeletonBody}><View style={styles.documentSkeletonTitle} /><View style={styles.documentSkeletonMeta} /></View><View style={styles.documentSkeletonAmount} /></View>)}</View> : documents.length ? documents.map((document, index) => <FinancialDocumentRow key={document.documentGuid || `${document.number}:${index}`} document={document} index={index} />) : <View style={styles.empty}><MaterialCommunityIcons name="file-check-outline" size={26} color="#94A3B8" /><Text style={styles.emptyText}>Документы не найдены</Text></View>}
      {financialDocuments.error ? <Text style={styles.documentsError}>{financialDocuments.error}</Text> : null}
      {financialDocuments.page?.hasMore ? <Pressable disabled={financialDocuments.loadingMore} onPress={financialDocuments.loadMore} style={({ pressed }) => [styles.loadMore, pressed && styles.filterTriggerPressed]}><MaterialCommunityIcons name={financialDocuments.loadingMore ? 'progress-clock' : 'chevron-down'} size={20} color="#2563EB" /><Text style={styles.loadMoreText}>{financialDocuments.loadingMore ? 'Загружаем…' : 'Показать ещё'}</Text></Pressable> : null}
    </SectionCard>
    <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}><Pressable style={styles.filterOverlay} onPress={() => setFilterOpen(false)}><View style={[styles.filterMenu, filterMenu]}>{FILTERS.map((item) => <Pressable key={item.key} onPress={() => selectFilter(item.key)} style={({ pressed }) => [styles.filterOption, item.key === filter && styles.filterOptionActive, pressed && styles.filterOptionPressed]}><MaterialCommunityIcons name={item.key === filter ? 'check-circle' : 'circle-outline'} size={18} color={item.key === filter ? '#2563EB' : '#94A3B8'} /><Text style={[styles.filterOptionText, item.key === filter && styles.filterOptionTextActive]}>{item.label}</Text></Pressable>)}</View></Pressable></Modal>
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#FFFFFF' }, content: { flexGrow: 1, backgroundColor: '#FFFFFF', paddingBottom: 34, gap: 1 },
  diagram: { minHeight: FINANCE_CHART_SIZE, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 }, donutWrap: { width: FINANCE_CHART_SIZE, height: FINANCE_CHART_SIZE, alignItems: 'center', justifyContent: 'center' }, donutCenter: { position: 'absolute', width: 112, height: 112, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 56, paddingHorizontal: 4 }, donutCenterSelected: { backgroundColor: 'rgba(248,250,252,0.94)' }, donutCenterPressed: { opacity: 0.6 }, donutCaption: { color: '#64748B', fontSize: 10, fontWeight: '700', textAlign: 'center' }, donutTotal: { width: 106, color: '#0F172A', fontSize: 15, fontWeight: '900', textAlign: 'center' }, donutPercent: { color: '#2563EB', fontSize: 9, fontWeight: '900', textAlign: 'center' }, donutHint: { color: '#94A3B8', fontSize: 8.5, fontWeight: '700', textAlign: 'center' },
  diagramPlaceholder: { minHeight: FINANCE_CHART_SIZE },
  financePeriod: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -7 }, financePeriodValue: { color: '#475569', fontSize: 12, fontWeight: '800' },
  legend: { flex: 1, minWidth: 108, gap: 4 }, legendItem: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4 }, legendItemSelected: { backgroundColor: '#F1F5F9' }, legendItemPressed: { opacity: 0.65 }, legendDot: { width: 9, height: 9, borderRadius: 5 }, legendText: { flex: 1, minWidth: 0, gap: 2 }, legendLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 }, legendLabel: { flexShrink: 1, color: '#64748B', fontSize: 10, fontWeight: '700' }, legendLabelSelected: { color: '#334155', fontWeight: '900' }, legendPercent: { color: '#94A3B8', fontSize: 9, fontWeight: '800' }, legendPercentSelected: { color: '#2563EB' }, legendValue: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, danger: { color: '#DC2626' }, success: { color: '#0F9F6E' },
  termsGrid: { flexDirection: 'row', alignItems: 'stretch' }, termFact: { width: '50%', minWidth: 0, gap: 4, paddingHorizontal: 8, paddingVertical: 6 }, termFactHeader: { minHeight: 27, flexDirection: 'row', alignItems: 'center', gap: 6 }, termFactLabel: { flex: 1, minWidth: 0, color: '#64748B', fontSize: 10.5, fontWeight: '800' }, termFactValue: { width: '100%', color: '#0F172A', fontSize: 18, lineHeight: 23, fontWeight: '900' }, termFactSecondary: { color: '#64748B', fontSize: 10.5, fontWeight: '700' }, agreementRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', paddingHorizontal: 8, paddingTop: 10 }, agreementBody: { flex: 1, minWidth: 0, gap: 2 }, agreementLabel: { color: '#64748B', fontSize: 10, fontWeight: '700' }, agreementValue: { color: '#1E293B', fontSize: 12.5, fontWeight: '800', lineHeight: 17 },
  filterControlRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 7 }, filterControlLabel: { color: '#64748B', fontSize: 11, fontWeight: '800' }, filterTrigger: { minWidth: 142, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, borderWidth: 1, borderColor: '#DCE5F1', borderRadius: 9, backgroundColor: '#FFFFFF', paddingHorizontal: 10 }, filterTriggerPressed: { backgroundColor: '#F8FAFC' }, filterTriggerText: { flex: 1, color: '#1E293B', fontSize: 11.5, fontWeight: '800' }, filterOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.12)' }, filterMenu: { position: 'absolute', borderWidth: 1, borderColor: '#DCE5F1', borderRadius: 12, backgroundColor: '#FFFFFF', paddingVertical: 5, shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 12 }, filterOption: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12 }, filterOptionActive: { backgroundColor: '#EFF6FF' }, filterOptionPressed: { opacity: 0.65 }, filterOptionText: { flex: 1, color: '#334155', fontSize: 12, fontWeight: '700' }, filterOptionTextActive: { color: '#1D4ED8', fontWeight: '900' },
  documentSummary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0', paddingBottom: 9 }, documentSummaryItem: { minWidth: 70, flex: 1, alignItems: 'center', gap: 1, paddingHorizontal: 5 }, documentSummaryValue: { color: '#0F172A', fontSize: 16, fontWeight: '900' }, documentSummaryLabel: { color: '#64748B', fontSize: 9.5, fontWeight: '700' }, warning: { color: '#D97706' }, info: { color: '#2563EB' },
  documentRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, documentIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, documentBody: { flex: 1, minWidth: 0, gap: 3 }, documentTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, documentTitle: { flex: 1, color: '#1E293B', fontSize: 12.5, fontWeight: '800' }, documentMeta: { color: '#64748B', fontSize: 9.5, fontWeight: '600' }, documentAmount: { maxWidth: '31%', color: '#0F172A', fontSize: 12.5, fontWeight: '900', textAlign: 'right' },
  empty: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 7 }, emptyText: { color: '#64748B', fontSize: 12, fontWeight: '600' }, loadMore: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }, loadMoreText: { color: '#2563EB', fontSize: 11.5, fontWeight: '900' },
  documentsSkeleton: { gap: 1 }, documentSkeletonRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, documentSkeletonIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#E8EEF6' }, documentSkeletonBody: { flex: 1, gap: 6 }, documentSkeletonTitle: { width: '58%', height: 12, borderRadius: 6, backgroundColor: '#E8EEF6' }, documentSkeletonMeta: { width: '82%', height: 9, borderRadius: 5, backgroundColor: '#F1F5F9' }, documentSkeletonAmount: { width: 72, height: 13, borderRadius: 6, backgroundColor: '#E8EEF6' }, documentsError: { color: '#DC2626', fontSize: 10.5, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
});
