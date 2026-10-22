import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import SvgChart, { SVGRenderer } from '@wuba/react-native-echarts/svgChart';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import type { StockMovement } from './products';
import { salesPoints, salesDayPrice, salesCurrency, type SalesPeriod, type SalesPoint } from './salesAnalytics';
import { stockMoney } from './stockMoney';

echarts.use([BarChart, LineChart, GridComponent, SVGRenderer]);
export const SALES_CHART_HEIGHT = 140;
const PLOT_HEIGHT = 112;
type Metric = 'quantity' | 'price';
const quantity = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });

function Plot({ points, width, unit, metric, currency, onSelect }: { points: SalesPoint[]; width: number; unit: string; metric: Metric; currency: string; onSelect: (day: string) => void }) {
  const ref = React.useRef<any>(null);
  const callback = React.useRef(onSelect); callback.current = onSelect;
  React.useEffect(() => {
    if (!ref.current || !width) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg', width, height: PLOT_HEIGHT });
    const prices = points.map(p => salesDayPrice(p, currency)).filter((value): value is number => value !== null);
    const low = prices.length ? Math.min(...prices) : 0, high = prices.length ? Math.max(...prices) : 0;
    // Avoid magnifying fractions of a kopeck into a dramatic price change.
    const margin = Math.max((high - low) * 0.1, high * 0.03, 1);
    chart.setOption({
      animation: false,
      grid: { left: metric === 'price' ? 56 : 42, right: 14, top: 18, bottom: 22 },
      xAxis: { type: 'category', data: points.map(p => p.day), axisTick: { show: false }, axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisLabel: { fontSize: 10, color: '#64748B', interval: Math.max(0, Math.ceil(points.length / 4) - 1), showMaxLabel: true, hideOverlap: true,
          formatter: (value: string) => `${Number(value.slice(8))}.${value.slice(5, 7)}` } },
      yAxis: { type: 'value', min: metric === 'quantity' ? 0 : Math.max(0, Math.floor(low - margin)), max: metric === 'price' ? Math.ceil(high + margin) : undefined,
        scale: metric === 'price', name: metric === 'price' ? `${currency}/${unit}` : unit, nameTextStyle: { color: '#64748B', fontSize: 10 }, splitNumber: 3,
        axisLabel: { color: '#64748B', fontSize: 10, formatter: (value: number) => quantity(value) },
        splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } } },
      series: [{ type: metric === 'price' ? 'line' : 'bar', showSymbol: true, showAllSymbol: true, symbol: 'circle', symbolSize: 9, connectNulls: false, barMaxWidth: 20,
        data: points.map(p => ({ value: metric === 'price' ? salesDayPrice(p, currency) : p.quantity, day: p.day })), itemStyle: { color: '#2563EB' }, emphasis: { itemStyle: { color: '#60A5FA' } } }],
    });
    const click = (event: any) => { if (event.data?.day) callback.current(event.data.day); };
    chart.on('click', click);
    return () => { chart.off('click', click); chart.dispose(); };
  }, [points, width, unit, metric, currency]);
  return <SvgChart ref={ref} style={{ width, height: PLOT_HEIGHT }} />;
}

export function StockSalesChart({ items, period, scope, complete, error, online, unit, onRetry }: {
  items: StockMovement[]; period: SalesPeriod; scope: string; complete: boolean; error: string | null; online: boolean; unit: string; onRetry: () => void;
}) {
  const [width, setWidth] = React.useState(0);
  const [metric, setMetric] = React.useState<Metric>('quantity');
  const [selection, setSelection] = React.useState<{ scope: string; day: string } | null>(null);
  const points = React.useMemo(() => salesPoints(items, period), [items, period]);
  const currencies = [...new Set(points.flatMap(point => point.documents.map(row => salesCurrency(row.currency))))];
  const currency = currencies.length === 1 ? currencies[0] : '';
  const selected = selection?.scope === scope ? points.find(p => p.day === selection.day) : undefined;
  const select = React.useCallback((day: string) => setSelection({ scope, day }), [scope]);
  return <View testID="stock-sales-chart" style={styles.chart} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={styles.metricSwitch}>{(['quantity', 'price'] as const).map(value => <Pressable key={value} accessibilityRole="tab"
      accessibilityLabel={value === 'quantity' ? 'График количества' : 'График цены'} accessibilityState={{ selected: metric === value }}
      onPress={() => { setMetric(value); setSelection(null); }} style={[styles.metricButton, metric === value && styles.activeMetric]}>
      <Text style={[styles.metricText, metric === value && styles.activeMetricText]}>{value === 'quantity' ? 'Количество' : 'Цена'}</Text>
    </Pressable>)}</View>
    {!online || error ? <View style={styles.message}><Text style={styles.note}>{!online ? 'Для графика нужно подключение к сети' : error}</Text><Pressable onPress={onRetry} accessibilityRole="button"><Text style={styles.link}>Повторить</Text></Pressable></View>
      : !complete ? <View style={styles.message}><ActivityIndicator size="small" /><Text style={styles.note}>Загружается весь период…</Text></View>
      : !points.some(p => p.documents.length) ? <View style={styles.message}><Text style={styles.note}>Продаж за выбранный период нет</Text></View>
      : metric === 'price' && !points.some(p => salesDayPrice(p, currency) !== null) ? <View style={styles.message}><Text style={styles.note}>{currencies.length > 1 ? 'Цены в разных валютах нельзя объединить в один график' : 'Цены продаж за период не переданы из 1С'}</Text></View>
      : <View accessibilityRole="adjustable" accessibilityLabel={`График ${metric === 'price' ? 'средней цены продажи за день, с учётом количества' : 'количества продаж'}, ${unit}. Выберите день для просмотра документов.`}
        accessibilityActions={[{ name: 'increment', label: 'Следующий день' }, { name: 'decrement', label: 'Предыдущий день' }]}
        onAccessibilityAction={event => { const i = selected ? points.indexOf(selected) : -1; const next = Math.max(0, Math.min(points.length - 1, i + (event.nativeEvent.actionName === 'decrement' ? -1 : 1))); select(points[next].day); }}>
        {width > 0 ? <Plot points={points} width={width} unit={unit} metric={metric} currency={currency} onSelect={select} /> : null}
      </View>}
    {complete && !error && online && selected ? <View style={styles.popover} accessibilityViewIsModal>
      <View style={styles.popupHeader}><Text style={styles.note}>{selected.day.split('-').reverse().join('.')}</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть данные продажи" onPress={() => setSelection(null)} hitSlop={6}><MaterialCommunityIcons name="close" size={18} color="#64748B" /></Pressable></View>
      <ScrollView nestedScrollEnabled style={styles.popupScroll}>
        {selected.documents.length ? selected.documents.map(item => <View key={item.id} style={styles.document}>
          <View style={styles.info}><MaterialCommunityIcons name="file-document-outline" size={16} color="#2563EB" /><Text style={styles.documentText}>{item.document.number || 'Без номера'}</Text></View>
          <View style={styles.info}><MaterialCommunityIcons name="account-outline" size={16} color="#64748B" /><Text style={styles.customer}>{item.counterparty || 'Клиент не указан'}</Text></View>
          <View style={styles.values}>{[
            ['Количество', `${quantity(item.quantity)} ${unit}`],
            ['Цена', item.price === null ? '—' : `${stockMoney(item.price, item.currency)}${unit ? `/${unit}` : ''}`],
            ['Сумма', item.amount === null ? '—' : stockMoney(item.amount, item.currency)],
          ].map(([label, value]) => <View key={label} style={styles.value}><Text style={styles.note}>{label}</Text><Text style={styles.number}>{value}</Text></View>)}</View>
          {item.price === null || item.amount === null ? <Text style={styles.note}>{item.costReason || 'Стоимость не передана из 1С'}</Text> : null}
        </View>) : <Text style={styles.note}>В этот день продаж нет</Text>}
      </ScrollView>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  chart: { height: SALES_CHART_HEIGHT, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E2E8F0' },
  metricSwitch: { height: 28, flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, gap: 4 },
  metricButton: { paddingHorizontal: 10, justifyContent: 'center', borderRadius: 7 }, activeMetric: { backgroundColor: '#DBEAFE' },
  metricText: { fontSize: 12, color: '#64748B' }, activeMetricText: { color: '#2563EB', fontWeight: '600' },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  note: { fontSize: 11, lineHeight: 15, color: '#64748B' }, link: { fontSize: 13, color: '#2563EB', padding: 8 },
  popover: { position: 'absolute', top: 4, right: 10, left: 10, maxHeight: 132, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', elevation: 6, shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, zIndex: 2 },
  popupHeader: { paddingHorizontal: 8, paddingTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  popupScroll: { flexShrink: 1 }, document: { padding: 8, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E2E8F0' },
  info: { flexDirection: 'row', gap: 5, alignItems: 'flex-start' }, documentText: { flex: 1, fontSize: 13, color: '#0F172A', fontWeight: '700' }, customer: { flex: 1, fontSize: 12, color: '#0F172A' },
  values: { flexDirection: 'row', gap: 6, paddingTop: 4 }, value: { flex: 1, minWidth: 0 }, number: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#0F172A' },
});
