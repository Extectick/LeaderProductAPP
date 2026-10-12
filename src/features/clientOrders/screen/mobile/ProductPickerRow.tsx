import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, Tooltip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ClientOrderProduct } from '@/utils/clientOrdersService';
import { formatMoney } from '../../lib/clientOrdersShared';
import { formatStockInlineLabel } from '../../lib/clientOrdersUi';
import { purchaseHistoryDays, purchaseHistoryLabel } from '../../lib/customerPurchaseHistory';
import type { ProductQuantityChange } from '../../lib/productPickerQuantity';
import { ProductPickerQuantityControl } from './ProductPickerQuantityControl';

function productMetrics(item: ClientOrderProduct, hasPriceType: boolean, hasWarehouse: boolean) {
  const price = hasPriceType ? item.basePrice : null;
  return [
    { key: 'stock', icon: 'warehouse' as const, title: 'Доступный остаток', value: hasWarehouse ? formatStockInlineLabel(item.stock, item.baseUnit) || '—' : '—' },
    { key: 'sale', icon: 'cash-multiple' as const, title: 'Цена продажи', value: formatMoney(price, item.currency) },
    { key: 'cost', icon: 'chart-bar' as const, title: 'Себестоимость', value: formatMoney(item.receiptPrice, item.currency) },
  ];
}

function ProductPickerMetric({ metric, compact = false, prominent = false }: {
  metric: ReturnType<typeof productMetrics>[number]; compact?: boolean; prominent?: boolean;
}) {
  return <Tooltip title={metric.title}>
    <View accessible accessibilityLabel={`${metric.title}: ${metric.value}`} style={styles.metric}>
      <MaterialCommunityIcons name={metric.icon} size={prominent ? 17 : compact ? 12 : 14} color="#64748B" />
      <Text style={[styles.metricValue, compact && styles.metricValueCompact, prominent && styles.saleValue]}
        numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{metric.value}</Text>
    </View>
  </Tooltip>;
}

export function ProductPickerMetrics({ item, hasPriceType, hasWarehouse, compact = false }: {
  item: ClientOrderProduct; hasPriceType: boolean; hasWarehouse: boolean; compact?: boolean;
}) {
  const metrics = productMetrics(item, hasPriceType, hasWarehouse);
  return <View style={[styles.metrics, compact && styles.metricsCompact]}>
    {metrics.map(metric => <ProductPickerMetric key={metric.key} metric={metric} compact={compact} />)}
  </View>;
}

export const ProductPickerRow = React.memo(function ProductPickerRow({ item, quantity, unit, fractional, renderThumbnail,
  disabled = false, selected = false, hasPriceType, hasWarehouse, onOpen, onLongPress, onChangeQuantity,
}: {
  item: ClientOrderProduct; quantity: number; unit: string; fractional: boolean; renderThumbnail: (item: ClientOrderProduct) => React.ReactNode;
  disabled?: boolean; selected?: boolean; hasPriceType: boolean; hasWarehouse: boolean;
  onOpen: (item: ClientOrderProduct) => void; onLongPress: (item: ClientOrderProduct) => void;
  onChangeQuantity: (item: ClientOrderProduct, change: ProductQuantityChange) => void;
}) {
  const longPressed = React.useRef(false);
  const historyDays = purchaseHistoryDays(item.lastPurchasedDate);
  const [stock, sale, cost] = productMetrics(item, hasPriceType, hasWarehouse);
  const thumbnail = React.useMemo(() => renderThumbnail(item), [item, renderThumbnail]);
  return <View style={[styles.row, selected && styles.selected]} testID={`product-row-${item.guid}`}>
    <View style={styles.thumbnail} testID={`product-thumbnail-${item.guid}`}>
      {thumbnail}
      {historyDays !== null ? <View style={styles.historyBadge} pointerEvents="none" accessible
        accessibilityLabel={purchaseHistoryLabel(item.lastPurchasedDate) || undefined} testID={`product-history-${item.guid}`}>
        <MaterialCommunityIcons name="history" size={13} color="#15803D" />
        <Text style={styles.historyText} numberOfLines={1}>{historyDays} дн.</Text>
      </View> : null}
    </View>
    <View style={styles.content}>
    <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={item.name}
      onPressIn={() => { longPressed.current = false; }}
      onLongPress={() => { longPressed.current = true; onLongPress(item); }} delayLongPress={280}
      onPress={() => { if (!longPressed.current) onOpen(item); }}>
      <Text style={styles.title} numberOfLines={3}>{item.name}</Text>
    </Pressable>
    <View style={styles.details}>
      <View style={styles.metricRow}>
        <ProductPickerMetric metric={sale} prominent />
        <ProductPickerMetric metric={stock} />
      </View>
      <View style={styles.metricRow}>
        <ProductPickerMetric metric={cost} />
        <ProductPickerQuantityControl key={item.guid} item={item} quantity={quantity} unit={unit}
          fractional={fractional} disabled={disabled} onChangeQuantity={onChangeQuantity} />
      </View>
    </View>
    </View>
  </View>;
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 8, paddingHorizontal: 12, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  selected: { backgroundColor: '#EFF6FF' },
  thumbnail: { width: 80, minHeight: 80, flexShrink: 0 },
  content: { flex: 1, minWidth: 0 },
  details: { alignSelf: 'stretch' },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  title: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: '#0F172A' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 9, rowGap: 3, marginTop: 2 },
  metricsCompact: { marginTop: 1, columnGap: 7 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  metricValue: { flexShrink: 1, fontSize: 12, lineHeight: 16, color: '#64748B', fontWeight: '600' },
  metricValueCompact: { fontSize: 10, lineHeight: 13 },
  saleValue: { color: '#0F172A', fontSize: 18, lineHeight: 24, fontWeight: '700' },
  historyBadge: { position: 'absolute', top: 0, left: 0, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(240, 253, 244, 0.94)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  historyText: { flexShrink: 1, color: '#15803D', fontSize: 10, lineHeight: 14, fontWeight: '600' },
});
