import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text, Tooltip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ClientOrderProduct } from '@/utils/clientOrdersService';
import { formatMoney } from '../../lib/clientOrdersShared';
import { formatStockInlineLabel } from '../../lib/clientOrdersUi';
import { purchaseHistoryLabel } from '../../lib/customerPurchaseHistory';

export function ProductPickerMetrics({ item, hasPriceType, hasWarehouse, compact = false }: {
  item: ClientOrderProduct; hasPriceType: boolean; hasWarehouse: boolean; compact?: boolean;
}) {
  const price = hasPriceType ? item.basePrice : null;
  const metrics = [
    { key: 'stock', icon: 'warehouse' as const, title: 'Доступный остаток', value: hasWarehouse ? formatStockInlineLabel(item.stock, item.baseUnit) || '—' : '—' },
    { key: 'sale', icon: 'cash-multiple' as const, title: 'Цена продажи', value: formatMoney(price, item.currency) },
    { key: 'cost', icon: 'chart-bar' as const, title: 'Себестоимость', value: formatMoney(item.receiptPrice, item.currency) },
  ];
  return <View style={[styles.metrics, compact && styles.metricsCompact]}>
    {metrics.map(metric => <Tooltip key={metric.key} title={metric.title}>
      <View accessible accessibilityLabel={`${metric.title}: ${metric.value}`} style={styles.metric}>
        <MaterialCommunityIcons name={metric.icon} size={compact ? 12 : 14} color="#64748B" />
        <Text style={[styles.metricValue, compact && styles.metricValueCompact]}>{metric.value}</Text>
      </View>
    </Tooltip>)}
  </View>;
}

export const ProductPickerRow = React.memo(function ProductPickerRow({ item, quantity, unit, thumbnail,
  disabled = false, selected = false, hasPriceType, hasWarehouse, onOpen, onLongPress, onStep, onEditQuantity,
}: {
  item: ClientOrderProduct; quantity: number; unit: string; thumbnail: React.ReactNode;
  disabled?: boolean; selected?: boolean; hasPriceType: boolean; hasWarehouse: boolean;
  onOpen: (item: ClientOrderProduct) => void; onLongPress: (item: ClientOrderProduct) => void;
  onStep: (item: ClientOrderProduct, delta: 1 | -1) => void; onEditQuantity: (item: ClientOrderProduct) => void;
}) {
  const longPressed = React.useRef(false);
  const history = purchaseHistoryLabel(item.lastPurchasedDate);
  const formatted = quantity.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
  return <View style={[styles.row, selected && styles.selected]} testID={`product-row-${item.guid}`}>
    <View style={styles.thumbnail} testID={`product-thumbnail-${item.guid}`}>{thumbnail}</View>
    <View style={styles.content}>
    <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={item.name}
      onPressIn={() => { longPressed.current = false; }}
      onLongPress={() => { longPressed.current = true; onLongPress(item); }} delayLongPress={280}
      onPress={() => { if (!longPressed.current) onOpen(item); }}>
      <Text style={styles.title} numberOfLines={3}>{item.name}</Text>
    </Pressable>
    <View style={styles.details}>
      <View style={styles.metadata}>
      <ProductPickerMetrics item={item} hasPriceType={hasPriceType} hasWarehouse={hasWarehouse} />
      {history ? <View style={styles.history}>
        <MaterialCommunityIcons name="history" size={14} color="#15803D" />
        <Text style={styles.historyText}>{history}</Text>
      </View> : null}
      </View>
    <View style={styles.counter}>
      {quantity > 0 ? <Pressable disabled={disabled} onPress={() => onEditQuantity(item)} style={styles.valueButton}
        accessibilityRole="button" accessibilityLabel={`Количество ${item.name}: ${formatted} ${unit}`}
        accessibilityHint="Нажмите, чтобы ввести количество" testID={`product-quantity-${item.guid}`}>
        <Text style={[styles.quantity, quantity > 0 && styles.active]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{formatted}</Text>
        <Text style={styles.unit} numberOfLines={1}>{unit}</Text>
      </Pressable> : <View style={styles.valueButton} />}
      <View style={styles.steps}>
        {quantity > 0 ? <IconButton icon="minus" size={17} iconColor="#2563EB" style={styles.step} disabled={disabled}
          accessibilityLabel={`Уменьшить количество ${item.name}`} onPress={() => onStep(item, -1)} testID={`product-minus-${item.guid}`} /> : <View style={styles.step} />}
        <IconButton icon="plus" size={17} iconColor="#2563EB" style={styles.step} disabled={disabled}
          accessibilityLabel={`Добавить единицу ${item.name}`} onPress={() => onStep(item, 1)} testID={`product-plus-${item.guid}`} />
      </View>
    </View>
    </View>
    </View>
  </View>;
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  selected: { backgroundColor: '#EFF6FF' },
  thumbnail: { width: 80, minHeight: 80, flexShrink: 0 },
  content: { flex: 1, minWidth: 0, gap: 3 },
  details: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metadata: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: '#0F172A' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 9, rowGap: 3, marginTop: 5 },
  metricsCompact: { marginTop: 1, columnGap: 7 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metricValue: { fontSize: 12, lineHeight: 16, color: '#64748B', fontWeight: '600' },
  metricValueCompact: { fontSize: 10, lineHeight: 13 },
  history: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  historyText: { color: '#15803D', fontSize: 12, lineHeight: 16 },
  counter: { width: 64, minHeight: 68, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  valueButton: { minHeight: 32, width: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 },
  quantity: { flexShrink: 1, fontSize: 18, lineHeight: 24, fontWeight: '700', color: '#334155' },
  active: { color: '#2563EB' },
  unit: { maxWidth: 22, fontSize: 10, color: '#64748B' },
  steps: { flexDirection: 'row' },
  step: { width: 32, height: 36, margin: 0 },
});
