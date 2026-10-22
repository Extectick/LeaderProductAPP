import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, Tooltip } from 'react-native-paper';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProductListRow } from '@/src/shared/ui/ProductListRow';
import type { StockProduct } from './products';
import { availableQuantity, incomingCostHint, incomingCostText } from './incomingCost';

export const stockNumber = (value: number | null | undefined) => typeof value !== 'number' || !Number.isFinite(value) ? '—' : value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
export const productUnit = (item?: StockProduct | null) => item?.baseUnit?.symbol || item?.baseUnit?.name || '';
export function StockThumbnail({ item, onOpen, compact = false }: { item: StockProduct; onOpen: () => void; compact?: boolean }) {
  return <Pressable style={[styles.photo, compact && styles.compactPhoto]} accessibilityRole="button" accessibilityLabel={`Изображение ${item.name}`} disabled={!item.imageThumbUrl} onPress={onOpen}>
    {item.imageThumbUrl ? <Image source={{ uri: item.imageThumbUrl, cacheKey: `${item.guid}:${item.imageHash || ''}` }} style={[styles.image, compact && styles.compactPhoto]}
      contentFit="contain" cachePolicy="memory-disk" recyclingKey={item.guid} />
      : <View style={styles.placeholder}><MaterialCommunityIcons name="image-outline" size={32} color="#94A3B8" /></View>}
  </Pressable>;
}
export const StockProductRow = React.memo(function StockProductRow({ item, onOpen, onOpenImages }: {
  item: StockProduct; onOpen: (item: StockProduct) => void; onOpenImages: (item: StockProduct) => void;
}) {
  const unit = productUnit(item), cost = incomingCostText(item.incomingCost, unit);
  const available = availableQuantity(item);
  return <ProductListRow thumbnail={<StockThumbnail item={item} onOpen={() => onOpenImages(item)} />}>
    <Pressable style={styles.content} onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={`Остатки ${item.name}`}>
      <Text style={styles.title} numberOfLines={3}>{item.name}</Text>
      <View style={styles.columns}>
        <View style={styles.available}><Tooltip title={item.availabilityReason || 'Доступно с учётом вашего резерва'}><View>
          <Text style={styles.label}>Доступно</Text><Text style={styles.quantity}>{stockNumber(available)}{available === null ? '' : ` ${unit}`}</Text>
        </View></Tooltip></View>
        <View style={styles.cost}><Tooltip title={incomingCostHint(item.incomingCost)}><View accessible accessibilityLabel={`Входящая цена: ${cost}. ${incomingCostHint(item.incomingCost)}`}>
          <Text style={styles.label}>Входящая</Text><Text style={styles.price}>{cost}</Text>
        </View></Tooltip></View>
      </View>
      <View style={styles.footer}>
        <View style={styles.metric} accessible accessibilityLabel={`В наличии ${stockNumber(item.inStock)} ${unit}`}>
          <MaterialCommunityIcons name="warehouse" size={16} color="#64748B" /><Text style={styles.secondary}>{stockNumber(item.inStock)} {unit}</Text>
        </View>
        <View style={styles.footerDivider} />
        <View style={styles.metric} accessible accessibilityLabel={`В резерве ${stockNumber(item.reserved)} ${unit}`}>
          <MaterialCommunityIcons name="lock-outline" size={15} color="#64748B" /><Text style={styles.secondary}>{stockNumber(item.reserved)} {unit}</Text>
        </View>
      </View>
    </Pressable>
  </ProductListRow>;
});
const styles = StyleSheet.create({
  compactPhoto: { minHeight: 80 },
  photo: { flex: 1, minHeight: 100 }, image: { width: '100%', height: '100%', minHeight: 100 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  content: { flex: 1, paddingVertical: 8 }, title: { fontSize: 16, lineHeight: 20, fontWeight: '700', color: '#0F172A' },
  columns: { flexDirection: 'row', marginTop: 12 }, available: { flex: 1, minWidth: 0, paddingRight: 8 },
  cost: { flex: 1.25, minWidth: 0, borderLeftWidth: 1, borderColor: '#E2E8F0', paddingLeft: 10 },
  label: { color: '#64748B', fontSize: 11, lineHeight: 16 }, quantity: { color: '#2563EB', fontSize: 20, lineHeight: 27, fontWeight: '700' },
  price: { color: '#0F172A', fontSize: 18, lineHeight: 27, fontWeight: '700' },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 4 }, secondary: { color: '#64748B', fontSize: 12, lineHeight: 18 },
  footerDivider: { width: 1, height: 14, backgroundColor: '#CBD5E1' },
});
