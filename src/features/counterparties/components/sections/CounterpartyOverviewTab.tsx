import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import SvgChart, { SVGRenderer } from '@wuba/react-native-echarts/svgChart';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsType } from 'echarts/core';
import type {
  CounterpartyCardBootstrap,
  CounterpartySalesPeriod,
  CounterpartySalesSummaryChartPoint,
} from '../../model/counterpartyCard.types';
import {
  formatCounterpartyDate,
  formatCounterpartyMoney,
  formatCounterpartyPercent,
  formatCounterpartySalesChange,
} from '../../model/counterpartyCard.formatters';
import { SectionCard, SectionUnavailable } from '../CounterpartyCardPrimitives';
import { CounterpartyPeriodSelector, type CounterpartyPeriodRange } from '../CounterpartyPeriodSelector';
import { InfoIcon } from '../MetricInfoDialog';

const CURRENT_COLOR = '#2563EB';
const COMPARE_COLOR = '#7C3AED';
const CHART_HEIGHT = 224;

echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);
function parseIsoDay(value: string | null | undefined) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

function shortDate(value: string | null | undefined) {
  const date = parseIsoDay(value);
  return date ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '') : '—';
}

function dateRange(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return '—';
  return `${shortDate(from)} — ${shortDate(to)}`;
}

function formatCompactMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽`;
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} тыс ₽`;
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
}

type SalesChartValue = {
  value: number;
  documents: number;
  periodFrom: string | null | undefined;
  periodTo: string | null | undefined;
};

type TooltipSeriesParam = {
  seriesName?: string;
  color?: string;
  seriesIndex?: number;
  data?: SalesChartValue;
};

function tooltipLine(param: TooltipSeriesParam, currency: string) {
  const point = param.data;
  if (!point) return '';
  const isCurrent = param.seriesIndex === 0 || param.seriesName === 'Текущий период';
  const marker = isCurrent ? '●' : '◆';
  return `{${isCurrent ? 'current' : 'comparison'}|${marker} ${param.seriesName || ''}}\n{value|${formatCounterpartyMoney(point.value, currency)} · ${point.documents.toLocaleString('ru-RU')} док.}\n{date|${dateRange(point.periodFrom, point.periodTo)}}`;
}

function calculatePointDifference(current?: SalesChartValue, comparison?: SalesChartValue) {
  if (!current || !comparison) return null;
  const amount = current.value - comparison.value;
  const percent = comparison.value === 0 ? null : amount / comparison.value * 100;
  return { amount, percent };
}

function tooltipDifference(current: SalesChartValue | undefined, comparison: SalesChartValue | undefined, currency: string) {
  const difference = calculatePointDifference(current, comparison);
  if (!difference) return '';
  const sign = difference.amount > 0 ? '+' : '';
  const percent = difference.percent === null ? 'нет базы сравнения' : `${difference.percent > 0 ? '+' : ''}${difference.percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
  const tone = difference.amount >= 0 ? 'positive' : 'negative';
  return `\n\n{${tone}|Разница: ${sign}${formatCounterpartyMoney(difference.amount, currency)} (${percent})}`;
}

function periodTotal(series: CounterpartySalesSummaryChartPoint[]) {
  return series.reduce((sum, point) => sum + (typeof point.salesAmount === 'number' && Number.isFinite(point.salesAmount) ? point.salesAmount : 0), 0);
}

function EChartsSalesLines({ current, comparison, period, currency, width }: { current: CounterpartySalesSummaryChartPoint[]; comparison: CounterpartySalesSummaryChartPoint[]; period: CounterpartySalesPeriod; currency: string; width: number }) {
  const chartRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!chartRef.current || width <= 0) return;
    const chart: EChartsType = echarts.init(chartRef.current, undefined, {
      renderer: 'svg',
      width,
      height: CHART_HEIGHT,
    });
    const currentValues: SalesChartValue[] = current.map((point) => ({
      value: Math.max(0, point.salesAmount || 0),
      documents: point.salesDocumentsCount ?? point.ordersCount ?? 0,
      periodFrom: point.periodFrom,
      periodTo: point.periodTo,
    }));
    const comparisonValues: SalesChartValue[] = comparison.map((point) => ({
      value: Math.max(0, point.salesAmount || 0),
      documents: point.salesDocumentsCount ?? point.ordersCount ?? 0,
      periodFrom: point.periodFrom,
      periodTo: point.periodTo,
    }));
    const count = Math.max(current.length, comparison.length);
    const labels = Array.from({ length: count }, (_, index) => {
      const point = current[index] || comparison[index];
      return point ? axisLabel(point, period, index, count) : '';
    });

    const showDocumentsOnChart = period === 'week';
    const visibleXAxisLabels = width < 340 ? 5 : 7;
    const xAxisInterval = count <= visibleXAxisLabels ? 0 : Math.max(0, Math.ceil(count / visibleXAxisLabels) - 1);

    chart.setOption({
      animation: true,
      animationDuration: 420,
      animationEasing: 'cubicOut',
      grid: { left: 50, right: 12, top: 25, bottom: 38, containLabel: false },
      tooltip: {
        show: true,
        trigger: 'axis',
        triggerOn: 'click',
        renderMode: 'richText',
        confine: true,
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderColor: '#CBD5E1',
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: '#0F172A', fontSize: 10, fontWeight: 700 },
        axisPointer: { type: 'line', lineStyle: { color: '#94A3B8', width: 1 } },
        formatter: (rawParams: TooltipSeriesParam | TooltipSeriesParam[]) => {
          const params = Array.isArray(rawParams) ? rawParams : [rawParams];
          const currentParam = params.find((param) => param.seriesIndex === 0 || param.seriesName === 'Текущий период');
          const comparisonParam = params.find((param) => param.seriesIndex === 1 || param.seriesName === 'Период сравнения');
          const lines = params.map((param) => tooltipLine(param, currency)).filter(Boolean).join('\n\n');
          return `${lines}${tooltipDifference(currentParam?.data, comparisonParam?.data, currency)}`;
        },
        rich: {
          current: { color: CURRENT_COLOR, fontSize: 10, fontWeight: 700, lineHeight: 15 },
          comparison: { color: COMPARE_COLOR, fontSize: 10, fontWeight: 700, lineHeight: 15 },
          value: { color: '#0F172A', fontSize: 11, fontWeight: 700, lineHeight: 16 },
          date: { color: '#64748B', fontSize: 9, lineHeight: 13 },
          positive: { color: '#16A34A', fontSize: 10, fontWeight: 700, lineHeight: 15 },
          negative: { color: '#DC2626', fontSize: 10, fontWeight: 700, lineHeight: 15 },
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisLabel: { color: '#64748B', fontSize: 9, fontWeight: 600, interval: xAxisInterval, margin: 12, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        min: 0,
        splitNumber: 3,
        axisLabel: { color: '#64748B', fontSize: 9, formatter: (value: number) => formatCompactMoney(value) },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#E2E8F0', width: 1 } },
      },
      series: [
        {
          name: 'Текущий период',
          type: 'line',
          data: currentValues,
          smooth: 0.25,
          symbol: 'circle',
          symbolSize: 8,
          showSymbol: true,
          lineStyle: { color: CURRENT_COLOR, width: 3 },
          itemStyle: { color: CURRENT_COLOR, borderColor: '#FFFFFF', borderWidth: 2 },
          areaStyle: { color: CURRENT_COLOR, opacity: 0.09 },
          label: { show: showDocumentsOnChart, position: 'top', distance: 5, color: CURRENT_COLOR, fontSize: 9, fontWeight: 700, formatter: (param: { data?: SalesChartValue }) => String(param.data?.documents ?? 0) },
          emphasis: { focus: 'series', scale: 1.4 },
        },
        {
          name: 'Период сравнения',
          type: 'line',
          data: comparisonValues,
          smooth: 0.25,
          symbol: 'diamond',
          symbolSize: 8,
          showSymbol: true,
          lineStyle: { color: COMPARE_COLOR, width: 2, type: 'dashed' },
          itemStyle: { color: '#FFFFFF', borderColor: COMPARE_COLOR, borderWidth: 2 },
          label: { show: showDocumentsOnChart, position: 'bottom', distance: 5, color: COMPARE_COLOR, fontSize: 9, fontWeight: 700, formatter: (param: { data?: SalesChartValue }) => String(param.data?.documents ?? 0) },
          emphasis: { focus: 'series', scale: 1.4 },
        },
      ],
    });

    return () => chart.dispose();
  }, [comparison, currency, current, period, width]);

  return <SvgChart ref={chartRef} style={{ width, height: CHART_HEIGHT }} />;
}

function axisLabel(point: CounterpartySalesSummaryChartPoint, period: CounterpartySalesPeriod, index: number, count: number) {
  const date = parseIsoDay(point.periodFrom);
  if (!date) return String(point.label || '');
  if (period === 'week') {
    const weekday = date.toLocaleDateString('ru-RU', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
    return `${weekday} ${date.getUTCDate()}`;
  }
  const pointTo = parseIsoDay(point.periodTo);
  const pointLengthDays = pointTo ? Math.round((pointTo.getTime() - date.getTime()) / 86_400_000) + 1 : 1;
  if (period === 'halfYear' || pointLengthDays > 20) {
    return date.toLocaleDateString('ru-RU', { month: 'short', timeZone: 'UTC' }).replace('.', '');
  }
  if (period === 'quarter' || pointLengthDays >= 6) return shortDate(point.periodFrom);
  if (count > 14) return String(date.getUTCDate());
  return shortDate(point.periodFrom);
}

function formatDays(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} дн.`;
}

function formatLastOrder(dateValue: string | null | undefined) {
  if (!dateValue) return '—';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return formatCounterpartyDate(dateValue);
  date.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((today.getTime() - date.getTime()) / 86_400_000));
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  return `${formatCounterpartyDate(dateValue)} (${days} дн. назад)`;
}

type OverviewTone = 'normal' | 'danger' | 'success';

function ValueSkeleton() {
  return <View style={styles.valueSkeleton} />;
}

function OverviewCard({ width, icon, label, value, secondary, tone = 'normal', loading, index, columns, total }: { width: number; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; value: string; secondary?: string | null; tone?: OverviewTone; loading: boolean; index: number; columns: number; total: number }) {
  const lastColumn = (index + 1) % columns === 0;
  const lastRow = Math.floor(index / columns) === Math.floor((total - 1) / columns);
  return (
    <View style={[styles.statCard, { width }, !lastColumn && styles.statCardColumnDivider, !lastRow && styles.statCardRowDivider]}>
      <View style={styles.statHeader}><View style={styles.statIcon}><MaterialCommunityIcons name={icon} size={23} color="#475569" /></View><Text numberOfLines={1} style={styles.statLabel}>{label}</Text><InfoIcon title={label} /></View>
      {loading ? <ValueSkeleton /> : <><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.statValue, tone === 'danger' && styles.summaryDanger, tone === 'success' && styles.summarySuccess]}>{value}</Text>{secondary ? <Text numberOfLines={1} adjustsFontSizeToFit style={styles.statSecondary}>{secondary}</Text> : null}</>}
    </View>
  );
}

function GridHeading({ title, icon }: { title: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }) {
  return <View style={styles.gridHeading}><MaterialCommunityIcons name={icon} size={21} color="#475569" /><Text style={styles.gridHeadingText}>{title}</Text><InfoIcon title={title} /></View>;
}

function OverviewGrid({ data, loading, currency, cardWidth, columns }: { data: CounterpartyCardBootstrap; loading: boolean; currency: string; cardWidth: number; columns: number }) {
  const { overview, salesSummary: sales } = data;
  if (!sales) return null;
  const change = sales.salesChangePercent;
  const salesItem = { icon: 'cash-multiple' as const, label: 'Продажи', value: formatCounterpartyMoney(sales.salesAmount, currency) };
  const profitItem = { icon: 'chart-areaspline' as const, label: 'Прибыль', value: formatCounterpartyMoney(sales.profit, currency), tone: sales.profit == null ? 'normal' as const : sales.profit >= 0 ? 'success' as const : 'danger' as const };
  const dynamicsItem = { icon: 'trending-up' as const, label: 'Динамика', value: formatCounterpartySalesChange(sales.salesAmount, sales.previousSalesAmount, change), tone: change == null ? 'normal' as const : change >= 0 ? 'success' as const : 'danger' as const };
  const profitabilityItem = { icon: 'percent-outline' as const, label: 'Рентабельность', value: formatCounterpartyPercent(sales.profitabilityPercent), tone: sales.profitabilityPercent == null ? 'normal' as const : sales.profitabilityPercent >= 0 ? 'success' as const : 'danger' as const };
  const averageItem = { icon: 'receipt-text-outline' as const, label: 'Средний чек', value: formatCounterpartyMoney(sales.averageCheck, currency) };
  const ordersItem = { icon: 'file-document-outline' as const, label: 'Заказов', value: sales.ordersCount == null ? '—' : String(sales.ordersCount) };
  const lastOrderItem = { icon: 'calendar-check-outline' as const, label: 'Последний заказ', value: formatLastOrder(sales.lastOrderDate || overview.lastOrderDate), secondary: formatCounterpartyMoney(sales.lastOrderAmount ?? overview.lastOrderAmount, currency) };
  const frequencyItem = { icon: 'calendar-sync-outline' as const, label: 'Частота заказов', value: formatDays(sales.orderFrequencyDays ?? sales.averageOrderIntervalDays) };
  const items: Array<Omit<React.ComponentProps<typeof OverviewCard>, 'width' | 'loading' | 'index' | 'columns' | 'total'>> = columns >= 3
    ? [salesItem, profitItem, averageItem, dynamicsItem, profitabilityItem, ordersItem, lastOrderItem, frequencyItem]
    : [salesItem, profitItem, dynamicsItem, profitabilityItem, averageItem, ordersItem, lastOrderItem, frequencyItem];
  return (
    <View style={styles.gridSection}>
      <GridHeading title="Показатели" icon="chart-line" />
      <View style={styles.cardGrid}>
        {items.map((item, index) => <OverviewCard key={item.label} {...item} width={cardWidth} loading={loading} index={index} columns={columns} total={items.length} />)}
      </View>
    </View>
  );
}

function ChartBlock({ data, period, loading }: { data: CounterpartyCardBootstrap; period: CounterpartySalesPeriod; loading: boolean }) {
  return (
    <SectionCard title="Динамика продаж" icon="chart-line">
      <SalesChart data={data} period={period} loading={loading} />
    </SectionCard>
  );
}

function SalesChart({ data, period, loading }: { data: CounterpartyCardBootstrap; period: CounterpartySalesPeriod; loading: boolean }) {
  const summary = data.salesSummary;
  const current = summary?.chartSeries || [];
  const comparisonAvailable = summary?.comparisonAvailable !== false;
  const comparison = comparisonAvailable ? summary?.comparisonChartSeries || [] : [];
  const [width, setWidth] = React.useState(0);
  const currency = summary?.currency || 'RUB';

  if (!current.length && !comparison.length) {
    return <Text style={styles.chartEmpty}>Нет данных для графика за выбранные периоды</Text>;
  }

  return (
    <View>
      <View style={styles.periodLegend}>
        <View style={styles.periodLegendRow}><View style={[styles.legendLine, { backgroundColor: CURRENT_COLOR }]} /><View style={styles.periodLegendText}><View><Text style={styles.periodLegendLabel}>Текущий период</Text><Text style={styles.periodLegendDate}>{dateRange(summary?.periodFrom, summary?.periodTo)}</Text></View><Text style={[styles.periodLegendTotal, { color: CURRENT_COLOR }]}>{formatCounterpartyMoney(periodTotal(current), currency)}</Text></View></View>
        {comparisonAvailable ? <View style={styles.periodLegendRow}><View style={styles.legendDashed}><View style={styles.legendDash} /><View style={styles.legendDash} /><View style={styles.legendDash} /></View><View style={styles.periodLegendText}><View><Text style={styles.periodLegendLabel}>Период сравнения</Text><Text style={styles.periodLegendDate}>{dateRange(summary?.compareFrom, summary?.compareTo)}</Text></View><Text style={[styles.periodLegendTotal, { color: COMPARE_COLOR }]}>{formatCounterpartyMoney(periodTotal(comparison), currency)}</Text></View></View> : <View style={styles.chartComparisonNote}><MaterialCommunityIcons name="information-outline" size={16} color="#64748B" /><Text style={styles.chartComparisonText}>Сравнение доступно для данных начиная с {formatCounterpartyDate(summary?.dataReliableFrom || '2026-03-31')}.</Text></View>}
      </View>
      <View style={styles.chartWrap} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {loading ? <View style={styles.chartLoadingLine} /> : null}
        {width > 0 ? <EChartsSalesLines current={current} comparison={comparison} period={period} currency={currency} width={width} /> : null}
      </View>
      <Text style={styles.chartHint}>{period === 'week' ? 'Число возле точки — количество документов. Нажмите для подробностей.' : 'Нажмите на точку, чтобы увидеть сумму, документы и разницу.'}</Text>
    </View>
  );
}

export function CounterpartyOverviewTab({ data, refreshing, onRefresh, onRetry, periodLoading, period, customRange, onPeriodChange, onCustomPeriodApply }: { data: CounterpartyCardBootstrap; refreshing: boolean; onRefresh: () => void; onRetry: () => void; periodLoading: boolean; period: CounterpartySalesPeriod; customRange: CounterpartyPeriodRange | null; onPeriodChange: (period: CounterpartySalesPeriod) => void; onCustomPeriodApply: (range: CounterpartyPeriodRange) => void }) {
  const { width } = useWindowDimensions();
  const columns = width >= 600 ? 3 : 2;
  const cardWidth = Math.floor((width - 20) / columns);
  const { overview, financeSummary, salesSummary } = data;
  const currency = financeSummary?.currency || salesSummary?.currency || 'RUB';
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <CounterpartyPeriodSelector period={period} customRange={customRange} onPeriodChange={onPeriodChange} onCustomPeriodApply={onCustomPeriodApply} />
      {data.availability.sales === 'available' && salesSummary ? (
        <>
          <OverviewGrid data={data} loading={periodLoading} currency={currency} cardWidth={cardWidth} columns={columns} />
          {/* График временно скрыт до следующей итерации дизайна. */}
        </>
      ) : <SectionUnavailable forbidden={data.availability.sales === 'forbidden'} onRetry={data.availability.sales === 'unavailable' ? onRetry : undefined} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#FFFFFF' }, content: { flexGrow: 1, backgroundColor: '#FFFFFF', paddingBottom: 24, gap: 1 },
  gridSection: { backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 11, gap: 8 },
  gridHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
  gridHeadingText: { color: '#0F172A', fontSize: 15, lineHeight: 22, fontWeight: '900' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCard: { alignItems: 'flex-start', gap: 5, paddingHorizontal: 10, paddingVertical: 11 },
  statCardColumnDivider: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#E2E8F0' },
  statCardRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  statHeader: { minWidth: 0, minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 7 },
  statIcon: { width: 27, height: 28, alignItems: 'center', justifyContent: 'center' },
  statLabel: { flex: 1, minWidth: 0, color: '#475569', fontSize: 12.5, lineHeight: 20, fontWeight: '800' },
  statValue: { width: '100%', color: '#0F172A', fontSize: 21, lineHeight: 27, fontWeight: '900' },
  statSecondary: { width: '100%', color: '#2563EB', fontSize: 14, lineHeight: 19, fontWeight: '800' },
  summaryDanger: { color: '#DC2626' }, summarySuccess: { color: '#0F9F6E' },
  valueSkeleton: { width: '75%', height: 22, borderRadius: 6, backgroundColor: '#E8EEF6' },
  periodLegend: { gap: 8, paddingBottom: 5 }, periodLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, periodLegendText: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, periodLegendLabel: { color: '#475569', fontSize: 11, fontWeight: '800' }, periodLegendDate: { color: '#64748B', fontSize: 9.5, fontWeight: '600', marginTop: 1 }, periodLegendTotal: { flexShrink: 1, fontSize: 11, fontWeight: '900', textAlign: 'right' }, legendLine: { width: 22, height: 3, borderRadius: 2 }, legendDashed: { width: 22, flexDirection: 'row', justifyContent: 'space-between' }, legendDash: { width: 5, height: 3, borderRadius: 2, backgroundColor: COMPARE_COLOR },
  chartComparisonNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: 8, backgroundColor: '#F1F5F9', paddingHorizontal: 9, paddingVertical: 7 }, chartComparisonText: { flex: 1, color: '#64748B', fontSize: 9.5, fontWeight: '600', lineHeight: 14 },
  chartWrap: { minHeight: CHART_HEIGHT, position: 'relative', overflow: 'visible' }, chartLoadingLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 4, backgroundColor: '#93C5FD' },
  chartHint: { color: '#94A3B8', fontSize: 9.5, fontWeight: '600', textAlign: 'center', marginTop: -2 },
  chartEmpty: { color: '#64748B', fontSize: 12, fontWeight: '600', textAlign: 'center', paddingVertical: 24 },
});
