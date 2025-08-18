// app/(main)/services/qrcodes/analytics.tsx
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnalyticsHeader from '@/components/QRcodes/Analytics/AnalyticsHeader';
import ChartSkeleton from '@/components/QRcodes/Analytics/ChartSkeleton';
import LineChart from '@/components/QRcodes/Analytics/LineChart';
import MetricsRow from '@/components/QRcodes/Analytics/MetricsRow';
import MonthHeatmap from '@/components/QRcodes/Analytics/MonthHeatmap';

import FilterModal from '@/components/QRcodes/Analytics/FilterModal';
import PeriodModal from '@/components/QRcodes/Analytics/PeriodModal';
import PresetsModal from '@/components/QRcodes/Analytics/PresetsModal';
import { useAnalyticsController } from '@/hooks/useAnalyticsController';


export default function QRAnalyticsMobileScreen() {
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const styles = getStyles(colors);

  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const ctrl = useAnalyticsController();

  const ListHeader = (
    <View>
      <AnalyticsHeader
        selectedCount={ctrl.selectedIds.length}
        periodLabel={ctrl.periodLabel}
        onOpenFilter={() => setFilterVisible(true)}
        onOpenPeriod={() => setPeriodVisible(true)}
        onOpenPresets={() => setPresetsVisible(true)}
      />

      {!!ctrl.error && (
        <View style={styles.errorBox}>
          <Text style={{ color: '#B91C1C' }}>{ctrl.error}</Text>
        </View>
      )}

      {ctrl.loading ? (
        <ChartSkeleton />
      ) : (
        <>
          <MetricsRow
            colors={colors}
            totals={ctrl.analytics?.totals}
            mini={{ scans: (ctrl.analytics?.series || []).map(s => s.scans).slice(-14) }}
          />

          {ctrl.chartZoom && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View style={{
                paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF'
              }}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  Период: {fmt(ctrl.chartZoom.from)} — {fmt(ctrl.chartZoom.to)}
                </Text>
              </View>
              <View style={{ width: 8 }} />
              <View
                style={{
                  height: 32, width: 32, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
                  alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
                }}
              >
                <Ionicons name="close" size={16} color={colors.text} onPress={ctrl.clearZoom} />
              </View>
            </View>
          )}

          <LineChart
            colors={colors}
            range={{ from: ctrl.computedRange.from, to: ctrl.computedRange.to, bucket: ctrl.computedRange.bucket }}
            series={(ctrl.analytics?.series || []).map(p => ({ ts: p.ts, value: p.scans }))}
            onZoomRequest={ctrl.requestZoom}
          />

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Активность (календарь)</Text>
          {ctrl.heatmapLoading ? (
            <ChartSkeleton />
          ) : (
            <MonthHeatmap
              month={ctrl.calendarMonth}
              data={ctrl.heatmapData}
              events={(ctrl.scans || []).map(s => ({
                ts: s.createdAt,
                city: s.location ?? undefined,
                title: `${s.device || ''} • ${s.browser || ''}`.trim(),
              }))}
              startOfWeek={1}
              palette="blue"
              highlightWeekends
              onChangeMonth={ctrl.setCalendarMonth}
            />
          )}
        </>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Последние сканы</Text>
    </View>
  );

  // модалки (локально на экране)
  const [filterVisible, setFilterVisible] = React.useState(false);
  const [periodVisible, setPeriodVisible] = React.useState(false);
  const [presetsVisible, setPresetsVisible] = React.useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={ctrl.scans}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const qr = ctrl.qrCodes.find((q) => q.id === item.qrListId);
          return (
            <View style={styles.scanCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.scanTitle}>{qr?.description || qr?.qrData || item.qrListId}</Text>
                <Text style={styles.scanSub}>
                  {new Date(item.createdAt).toLocaleString()} • {item.device || 'unknown'} • {item.browser || 'unknown'}
                </Text>
                <Text style={styles.scanSub}>{item.location || 'Unknown'}</Text>
              </View>
              <Ionicons name="navigate" size={18} color="#9CA3AF" />
            </View>
          );
        }}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          ctrl.scansLoading ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={{ paddingVertical: 16 }}>
              <Text style={{ color: colors.secondaryText }}>Нет сканов за выбранный период</Text>
            </View>
          )
        }
        ListFooterComponent={
          <View style={{ paddingVertical: 12, alignItems: 'center' }}>
            {ctrl.scans.length < ctrl.scansMeta.total ? (
              <Text style={{ color: colors.secondaryText }}>
                {ctrl.loadingMore ? 'Загрузка...' : 'Прокрутите ниже для загрузки'}
              </Text>
            ) : (
              <View style={{ height: 4 }} />
            )}
          </View>
        }
        onEndReachedThreshold={0.4}
        onEndReached={ctrl.loadMoreScans}
        refreshControl={
          <RefreshControl
            refreshing={ctrl.refreshing}
            onRefresh={ctrl.onRefresh}
            tintColor={colors.text}
            colors={[colors.text]}
          />
        }
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 24 + insets.bottom + tabBarHeight,
        }}
      />

      {/* модалки */}
      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        qrCodes={ctrl.qrCodes}
        selectedIds={ctrl.selectedIds}
        onToggle={(id) => ctrl.toggleQrSelection(id)}
        onClear={() => setFilterVisible(false)}
        onApply={() => setFilterVisible(false)}
      />

      <PeriodModal
        visible={periodVisible}
        onClose={() => setPeriodVisible(false)}
        current={ctrl.periodKey}
        currentFrom={ctrl.customFrom}
        currentTo={ctrl.customTo}
        onApply={(key, from, to) => {
          ctrl.applyPeriod(key, from, to);
          setPeriodVisible(false);
        }}
      />

      <PresetsModal
        visible={presetsVisible}
        onClose={() => setPresetsVisible(false)}
        onApply={(preset) => {
          ctrl.applyPeriod(
            preset.period,
            preset.from ? new Date(preset.from) : null,
            preset.to ? new Date(preset.to) : null
          );
          // опционально можешь прокинуть прямой setter selectedIds в хук
          setPresetsVisible(false);
        }}
        onDeletePreset={(name) => console.log('delete preset', name)}
      />
    </View>
  );
}

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

const getStyles = (colors: any) =>
  StyleSheet.create({
    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
    errorBox: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginTop: 8 },
    scanCard: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: '#eef2ff',
      borderRadius: 10,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBackground,
    },
    scanTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    scanSub: { color: colors.secondaryText, fontSize: 12, marginTop: 2 },
  });
