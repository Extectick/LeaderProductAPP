import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, ProgressBar, Text, TouchableRipple } from 'react-native-paper';
import type { OfflineSyncTransfer } from '../../offline/offlineOrdersSync';
import { OFFLINE_SYNC_RETRY_MESSAGE } from '../../offline/offlineSyncError';

const datasetNames: Record<NonNullable<OfflineSyncTransfer['entity']>, string> = {
  catalog: 'номенклатуру', organizations: 'организации', warehouses: 'склады',
  counterparties: 'клиентов', agreements: 'соглашения', contracts: 'договоры',
  'delivery-addresses': 'адреса', 'price-types': 'виды цен', 'order-options': 'настройки заказов',
  'selling-prices': 'цены', stock: 'остатки', 'manager-stock': 'резервы',
};

function timestamp(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
    : null;
}

export function OfflineProductDataNote({ online, syncedAt }: { online: boolean; syncedAt: string | null }) {
  if (online) return null;
  const date = timestamp(syncedAt);
  return <Text testID="offline-product-freshness" style={styles.productNote}>
    {date ? `Цены и остатки обновлены ${date}` : 'Офлайн-данные цен и остатков ещё не загружены'}
  </Text>;
}

type Props = {
  online?: boolean;
  ready: boolean;
  syncedAt: string | null;
  loading: boolean;
  progress: number | null;
  error: string | null;
  transfer?: OfflineSyncTransfer | null;
  disabled?: boolean;
  trailingAction?: React.ReactNode;
  onRefresh: () => void;
};

export function OfflineDataBanner({ online = true, ready, syncedAt, loading, progress, error, transfer, disabled, trailingAction, onRefresh }: Props) {
  const isLoading = online && loading;
  const date = ready ? timestamp(syncedAt) : null;
  const total = transfer?.total ?? Object.keys(datasetNames).length;
  const formatCount = (value: number) => Math.max(0, Math.trunc(value)).toLocaleString('ru-RU');
  const count = transfer?.entity && typeof transfer.itemsLoaded === 'number'
    ? `${formatCount(transfer.itemsLoaded)}/${typeof transfer.itemsTotal === 'number' ? formatCount(transfer.itemsTotal) : '…'}`
    : null;
  const loadingLabel = transfer?.entity
    ? `${transfer.updating ? 'Обновляем' : 'Загружаем'} ${datasetNames[transfer.entity]}`
    : transfer?.completed === total ? 'Проверка завершена' : 'Проверяем изменения';
  const label = !online ? (date ? `Офлайн · Данные: ${date}` : ready ? 'Офлайн · Данные на телефоне' : 'Офлайн · Данные не загружены')
    : isLoading ? loadingLabel
    : error ? OFFLINE_SYNC_RETRY_MESSAGE
      : date ? `Данные на телефоне: ${date}` : 'Загрузить данные для офлайна';
  const value = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : null;
  const color = online ? '#6D28D9' : '#64748B';
  const unavailable = !!disabled || isLoading || !online;
  return (
    <View testID="orders-sync-strip" style={[styles.banner, !online && styles.offlineBanner]}>
      {isLoading ? <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ProgressBar testID="offline-data-progress" progress={value ?? 0} indeterminate={value === null} color="#DDD6FE" style={styles.progress} />
      </View> : null}
      <TouchableRipple
      testID="offline-data-banner"
      accessibilityRole="button"
      accessibilityLabel={isLoading && count ? `${label}, элементы: ${count}` : label}
      accessibilityHint={!online ? `${ready ? 'Сохранённые данные доступны на телефоне. ' : ''}Для обновления подключитесь к интернету` : error
        ? `${date ? `На телефоне сохранены данные: ${date}. ` : ''}Нажмите, чтобы повторить загрузку`
        : 'Проверить цены, остатки и справочники. Загрузятся только изменения и удаления'}
      accessibilityState={{ disabled: unavailable, busy: isLoading }}
      disabled={unavailable}
      onPress={onRefresh}
      rippleColor="#DDD6FE"
      style={styles.refreshAction}
    >
      <View style={styles.row}>
        <Icon source={!online ? 'cloud-off-outline' : error && !isLoading ? 'alert-circle-outline' : 'database-sync-outline'} size={18} color={color} />
        <Text numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.2} style={[styles.label, { color }]}>{label}</Text>
        {isLoading && count ? <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.count}>{count}</Text> : null}
        {online && !isLoading ? <Icon source={ready ? 'refresh' : 'download'} size={18} color={color} /> : null}
      </View>
      </TouchableRipple>
      {trailingAction}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', borderRadius: 0, backgroundColor: '#F5F3FF', overflow: 'hidden' },
  refreshAction: { flex: 1, minWidth: 0, alignSelf: 'stretch', borderRadius: 0, overflow: 'hidden' },
  offlineBanner: { backgroundColor: '#F1F5F9' },
  row: { height: 40, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { flex: 1, minWidth: 0, color: '#6D28D9', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  count: { flexShrink: 0, color: '#6D28D9', fontSize: 12, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  progress: { height: 40, borderRadius: 0, backgroundColor: '#F5F3FF' },
  productNote: { paddingHorizontal: 12, paddingVertical: 3, color: '#64748B', fontSize: 11, lineHeight: 14 },
});
