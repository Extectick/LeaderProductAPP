import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, IconButton, Text, TouchableRipple } from 'react-native-paper';
import type { TrackingTimelineItem } from './TrackingDayPanel.types';
import { trackingTime } from './trackingPresentation';

export default function TrackingPointNavigation({ item, index, count, hasMore, loading, error, onPrevious, onNext, onFocus, onOpenOrder }: {
  item?: TrackingTimelineItem;
  index: number; count: number; hasMore: boolean; loading: boolean;
  error?: string | null;
  onPrevious: () => void; onNext: () => void; onFocus: () => void; onOpenOrder: () => void;
}) {
  if (!item && !hasMore) return null;
  return <View style={styles.row} testID="tracking-point-navigation">
    <IconButton icon="chevron-left" size={24} style={styles.arrow} accessibilityLabel="Предыдущее событие маршрута" disabled={index <= 0 || loading} onPress={onPrevious} />
    <TouchableRipple style={styles.content} onPress={onFocus} disabled={!item || item.latitude == null || item.longitude == null} accessibilityRole="button" accessibilityLabel="Показать выбранное событие на карте">
      <View>
        <Text style={styles.caption}>{item ? `${trackingTime(item.at)} · ${index + 1} / ${count}${hasMore ? '+' : ''}` : 'Следующие события'}</Text>
        <View style={styles.titleRow}><Icon source={item?.icon || 'map-marker-outline'} size={18} color={item?.color || '#2563EB'} /><Text style={styles.title} numberOfLines={1}>{item?.title || 'Загрузить'}</Text></View>
        {error ? <Text style={[styles.caption, styles.error]} numberOfLines={2} accessibilityLiveRegion="polite">Не удалось загрузить события. Повторите →</Text> : item ? <Text style={styles.caption} numberOfLines={2}>{item.subtitle}</Text> : null}
      </View>
    </TouchableRipple>
    {item?.orderGuid ? <IconButton icon="file-document-outline" size={20} style={styles.order} accessibilityLabel="Открыть выбранный заказ" onPress={onOpenOrder} /> : null}
    <IconButton icon="chevron-right" size={24} style={styles.arrow} accessibilityLabel="Следующее событие маршрута" loading={loading} disabled={loading || (index >= count - 1 && !hasMore)} onPress={onNext} />
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  arrow: { width: 42, height: 44, margin: 0 },
  order: { width: 36, height: 44, margin: 0 },
  content: { flex: 1, minWidth: 0, paddingVertical: 6, minHeight: 64, justifyContent: 'center' },
  caption: { fontSize: 11, lineHeight: 15, color: '#64748B' },
  error: { color: '#B91C1C' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: '#0F172A', flexShrink: 1 },
});
