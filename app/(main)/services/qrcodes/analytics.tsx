
// app/(main)/services/qrcodes/analytics.tsx (with crash logs) — FIXED duplicate onEndReached
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import React, { useCallback, useMemo } from 'react';
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
import { logger } from '@/utils/logger';

const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;

const formatDateTime = (input: string | number | Date) => {
  const d = new Date(input);
  if (isNaN(+d)) return 'Invalid date';
  try {
    return d.toLocaleString();
  } catch {
    return `${fmtDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
};

class ScreenErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    logger.captureException(error, { where: 'AnalyticsScreen', info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontWeight: '700', marginBottom: 6 }}>Что-то пошло не так</Text>
          <Text>Попробуйте обновить экран или изменить фильтр</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function QRAnalyticsMobileScreen() {
  const { theme, themes } = useTheme();
  const colors = (themes && themes[theme]) || (themes && (themes as any).light) || {};
  const styles = useMemo(() => getStyles(colors), [colors]);

  const insets = useSafeAreaInsets();

  let tabBarHeight = 0;
  try {
    tabBarHeight = useBottomTabBarHeight();
  } catch (e) {
    logger.warn('useBottomTabBarHeight failed (not in tabs?)');
    tabBarHeight = 0;
  }

  const ctrl = useAnalyticsController();

  const scans = Array.isArray((ctrl as any)?.scans) ? (ctrl as any).scans : [];
  const scansMetaTotal = Number((ctrl as any)?.scansMeta?.total) || 0;
  const hasMore = scans.length < scansMetaTotal;

  const seriesRaw = Array.isArray((ctrl as any)?.analytics?.series)
    ? (ctrl as any).analytics.series
    : [];
  const safeSeries = seriesRaw
    .filter(Boolean)
    .map((p: any) => ({
      ts: p.ts,
      value: Number.isFinite(p?.scans) ? p.scans : 0,
    }));

  const miniScans = seriesRaw
    .filter(Boolean)
    .map((s: any) => (Number.isFinite(s?.scans) ? s.scans : 0))
    .slice(-14);

  const heatmapData = Array.isArray((ctrl as any)?.heatmapData) ? (ctrl as any).heatmapData : [];

  const events = scans.map((s: any) => ({
    ts: s?.createdAt,
    city: s?.location ?? undefined,
    title: `${s?.device || ''} • ${s?.browser || ''}`.trim(),
  }));

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      try {
        const qr = Array.isArray((ctrl as any)?.qrCodes)
          ? (ctrl as any).qrCodes.find((q: any) => q.id === item.qrListId)
          : undefined;
        const title = qr?.description || qr?.qrData || item?.qrListId || `#${index}`;
        return (
          <View style={styles.scanCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.scanTitle}>{String(title)}</Text>
              <Text style={styles.scanSub}>
                {formatDateTime(item?.createdAt)} • {item?.device || 'unknown'} • {item?.browser || 'unknown'}
              </Text>
              <Text style={styles.scanSub}>{item?.location || 'Unknown'}</Text>
            </View>
            <Ionicons name="navigate" size={18} color="#9CA3AF" />
          </View>
        );
      } catch (e) {
        logger.captureException(e, { item }, 'renderItem');
        return (
          <View style={styles.scanCard}>
            <Text style={styles.scanTitle}>Ошибка отображения элемента</Text>
          </View>
        );
      }
    },
    [ctrl, styles]
  );

  const keyExtractor = useCallback((item: any, index: number) => String(item?.id ?? `scan-${index}`), []);

  // SINGLE handler: log + load more
  const handleEndReached = useCallback((info: { distanceFromEnd: number }) => {
    logger.debug('Analytics: end reached', info);
    (ctrl as any)?.loadMoreScans?.();
  }, [ctrl]);

  const ListHeader = (
    <View>
      <AnalyticsHeader
        selectedCount={Array.isArray((ctrl as any)?.selectedIds) ? (ctrl as any).selectedIds.length : 0}
        periodLabel={(ctrl as any)?.periodLabel || ''}
        onOpenFilter={() => setFilterVisible(true)}
        onOpenPeriod={() => setPeriodVisible(true)}
        onOpenPresets={() => setPresetsVisible(true)}
      />

      {!!(ctrl as any)?.error && (
        <View style={styles.errorBox}>
          <Text style={{ color: '#B91C1C' }}>{(ctrl as any).error}</Text>
        </View>
      )}

      {(ctrl as any)?.loading ? (
        <ChartSkeleton />
      ) : (
        <>
          <MetricsRow
            colors={colors}
            totals={(ctrl as any)?.analytics?.totals}
            mini={{ scans: miniScans }}
          />

          {(ctrl as any)?.chartZoom && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <Text style={{ color: (colors as any).text, fontWeight: '700' }}>
                  Период: {fmtDate((ctrl as any).chartZoom.from)} — {fmtDate((ctrl as any).chartZoom.to)}
                </Text>
              </View>
              <View style={{ width: 8 }} />
              <View
                style={{
                  height: 32,
                  width: 32,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <Ionicons name="close" size={16} color={(colors as any).text} onPress={(ctrl as any).clearZoom} />
              </View>
            </View>
          )}

          <LineChart
            colors={colors}
            range={{
              from: (ctrl as any)?.computedRange?.from,
              to: (ctrl as any)?.computedRange?.to,
              bucket: (ctrl as any)?.computedRange?.bucket,
            }}
            series={safeSeries}
            onZoomRequest={(ctrl as any)?.requestZoom}
          />

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Активность (календарь)</Text>
          {(ctrl as any)?.heatmapLoading ? (
            <ChartSkeleton />
          ) : (
            <MonthHeatmap
              month={(ctrl as any)?.calendarMonth}
              data={heatmapData}
              events={events}
              startOfWeek={1}
              palette="blue"
              highlightWeekends
              onChangeMonth={(ctrl as any)?.setCalendarMonth}
            />
          )}
        </>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Последние сканы</Text>
    </View>
  );

  const [filterVisible, setFilterVisible] = React.useState(false);
  const [periodVisible, setPeriodVisible] = React.useState(false);
  const [presetsVisible, setPresetsVisible] = React.useState(false);

  return (
    <ScreenErrorBoundary>
      <View style={{ flex: 1, backgroundColor: (colors as any).background }}>
        <FlatList
          data={scans}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            (ctrl as any)?.scansLoading ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator />
              </View>
            ) : (
              <View style={{ paddingVertical: 16 }}>
                <Text style={{ color: (colors as any).secondaryText }}>Нет сканов за выбранный период</Text>
              </View>
            )
          }
          ListFooterComponent={
            <View style={{ paddingVertical: 12, alignItems: 'center' }}>
              {hasMore ? (
                <Text style={{ color: (colors as any).secondaryText }}>
                  {(ctrl as any)?.loadingMore ? 'Загрузка...' : 'Прокрутите ниже для загрузки'}
                </Text>
              ) : (
                <View style={{ height: 4 }} />
              )}
            </View>
          }
          onEndReachedThreshold={0.4}
          onEndReached={handleEndReached}
          refreshControl={
            <RefreshControl
              refreshing={(ctrl as any)?.refreshing}
              onRefresh={(ctrl as any)?.onRefresh}
              tintColor={(colors as any).text}
              colors={[(colors as any).text]}
            />
          }
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 24 + insets.bottom + tabBarHeight,
          }}
          onScrollBeginDrag={() => logger.debug('Analytics: scroll begin')}
        />

        <FilterModal
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          qrCodes={Array.isArray((ctrl as any)?.qrCodes) ? (ctrl as any).qrCodes : []}
          selectedIds={Array.isArray((ctrl as any)?.selectedIds) ? (ctrl as any).selectedIds : []}
          onToggle={(id: any) => (ctrl as any)?.toggleQrSelection?.(id)}
          onClear={() => setFilterVisible(false)}
          onApply={() => setFilterVisible(false)}
        />

        <PeriodModal
          visible={periodVisible}
          onClose={() => setPeriodVisible(false)}
          current={(ctrl as any)?.periodKey}
          currentFrom={(ctrl as any)?.customFrom}
          currentTo={(ctrl as any)?.customTo}
          onApply={(key: any, from: any, to: any) => {
            (ctrl as any)?.applyPeriod?.(key, from, to);
            logger.info('Analytics: period applied', { key, from, to });
            setPeriodVisible(false);
          }}
        />

        <PresetsModal
          visible={presetsVisible}
          onClose={() => setPresetsVisible(false)}
          onApply={(preset: any) => {
            (ctrl as any)?.applyPeriod?.(
              preset.period,
              preset.from ? new Date(preset.from) : null,
              preset.to ? new Date(preset.to) : null
            );
            logger.info('Analytics: preset applied', { preset });
            setPresetsVisible(false);
          }}
          onDeletePreset={(name: string) => logger.warn('Analytics: preset delete requested', { name })}
        />
      </View>
    </ScreenErrorBoundary>
  );
}

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
