import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, ProgressBar, Text, TouchableRipple } from 'react-native-paper';

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
  ready: boolean;
  syncedAt: string | null;
  loading: boolean;
  progress: number | null;
  error: string | null;
  disabled?: boolean;
  onRefresh: () => void;
};

export function OfflineDataBanner({ ready, syncedAt, loading, progress, error, disabled, onRefresh }: Props) {
  const date = ready ? timestamp(syncedAt) : null;
  const label = loading ? 'Загружаем данные на телефон'
    : error ? date ? `Не обновлено · на телефоне ${date}` : error
      : date ? `Данные на телефоне: ${date}` : 'Загрузить данные для офлайна';
  const value = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : null;
  return (
    <TouchableRipple
      testID="offline-data-banner"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={error || 'Скачать номенклатуру, справочники, цены и остатки для работы без сети'}
      accessibilityState={{ disabled: !!disabled || loading, busy: loading }}
      disabled={!!disabled || loading}
      onPress={onRefresh}
      rippleColor="#DDD6FE"
      style={styles.banner}
    >
      <View style={styles.row}>
        <Icon source={error && !loading ? 'alert-circle-outline' : 'database-sync-outline'} size={18} color="#6D28D9" />
        <Text numberOfLines={1} style={styles.label}>{label}</Text>
        {loading && value !== null ? <Text style={styles.percent}>{Math.floor(value * 100)}%</Text> : null}
        {!loading ? <Icon source={ready ? 'refresh' : 'download'} size={18} color="#6D28D9" /> : null}
        {loading ? <ProgressBar
          testID="offline-data-progress"
          progress={value ?? 0}
          indeterminate={value === null}
          color="#7C3AED"
          style={styles.progress}
        /> : null}
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  banner: { alignSelf: 'stretch', borderRadius: 0, backgroundColor: '#F5F3FF' },
  row: { minHeight: 34, paddingHorizontal: 12, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { flex: 1, color: '#6D28D9', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  percent: { color: '#6D28D9', fontSize: 11, lineHeight: 18, fontVariant: ['tabular-nums'] },
  progress: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderRadius: 0, backgroundColor: '#DDD6FE' },
  productNote: { paddingHorizontal: 12, paddingVertical: 3, color: '#64748B', fontSize: 11, lineHeight: 14 },
});
