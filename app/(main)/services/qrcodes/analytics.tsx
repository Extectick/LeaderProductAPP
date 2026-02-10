
// app/(main)/services/qrcodes/analytics.tsx (with crash logs) — FIXED duplicate onEndReached
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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

import FilterModal from '@/components/QRcodes/Analytics/FilterModal';
import PeriodModal from '@/components/QRcodes/Analytics/PeriodModal';
import PresetsModal from '@/components/QRcodes/Analytics/PresetsModal';
import { useAnalyticsController } from '@/hooks/useAnalyticsController';
import { logger } from '@/utils/logger';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';

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
  const colors = useMemo(
    () => (themes && themes[theme]) || (themes && (themes as any).light) || {},
    [theme, themes]
  );
  const styles = useMemo(() => getStyles(colors), [colors]);
  const buildMonthGrid = useCallback((month: Date, startOfWeek: 0 | 1 = 1) => {
    const d0 = new Date(month.getFullYear(), month.getMonth(), 1);
    const shift = (d0.getDay() - startOfWeek + 7) % 7;
    const start = new Date(d0);
    start.setDate(d0.getDate() - shift);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, []);

  const insets = useSafeAreaInsets();
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });
  const tabBarHeight = React.useContext(BottomTabBarHeightContext) ?? 0;

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

  const scansPerDay = useMemo(() => {
    const map = new Map<string, number>();
    (ctrl as any)?.scans?.forEach((s: any) => {
      const d = new Date(s.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [ctrl]);
  const calendarMonthValue = (ctrl as any)?.calendarMonth;
  const calendarMonth = useMemo(
    () => (calendarMonthValue instanceof Date ? calendarMonthValue : new Date()),
    [calendarMonthValue]
  );
  const calendarMonthLabel = useMemo(
    () => calendarMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    [calendarMonth]
  );
  const calendarGrid = useMemo(() => buildMonthGrid(calendarMonth, 1), [calendarMonth, buildMonthGrid]);
  const calendarWeeks = useMemo(
    () => Array.from({ length: 6 }, (_, i) => calendarGrid.slice(i * 7, i * 7 + 7)),
    [calendarGrid]
  );
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const lastAppliedRange = useRef<string | null>(null);
  const isManualPick = useRef(false);

  const shiftMonth = (delta: number) => {
    const d = new Date(calendarMonth);
    d.setMonth(d.getMonth() + delta);
    (ctrl as any)?.setCalendarMonth?.(d);
  };

  const handleDaySelect = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(d);
      setRangeEnd(null);
      lastAppliedRange.current = null;
      isManualPick.current = true;
      return;
    }
    if (d.getTime() < rangeStart.getTime()) {
      setRangeEnd(rangeStart);
      setRangeStart(d);
    } else {
      setRangeEnd(d);
    }
  };

  React.useEffect(() => {
    if (rangeStart && rangeEnd) {
      const from = new Date(rangeStart); from.setHours(0, 0, 0, 0);
      const to = new Date(rangeEnd); to.setHours(23, 59, 59, 999);
      const key = `${from.toISOString()}_${to.toISOString()}`;
      if (lastAppliedRange.current !== key) {
        lastAppliedRange.current = key;
        // принудительно ставим "произвольно", чтобы фильтр отображал кастомный период
        (ctrl as any)?.setPeriodKey?.('custom');
        (ctrl as any)?.applyPeriod?.('custom', from, to);
      }
      isManualPick.current = false;
    }
  }, [rangeStart, rangeEnd, ctrl]);

  // синхронизируем выделение при смене периода через фильтр/пресет, избегая бесконечных перерендеров
  const computedFrom = (ctrl as any)?.computedRange?.from;
  const computedTo = (ctrl as any)?.computedRange?.to;
  React.useEffect(() => {
    if (isManualPick.current) return; // пользователь сейчас выбирает вручную
    if (!computedFrom || !computedTo) return;
    const f = new Date(computedFrom); f.setHours(0,0,0,0);
    const t = new Date(computedTo); t.setHours(23,59,59,999);
    const key = `${f.toISOString()}_${t.toISOString()}`;
    if (lastAppliedRange.current === key) return;
    lastAppliedRange.current = key;
    setRangeStart(f);
    setRangeEnd(t);
    (ctrl as any)?.setCalendarMonth?.(f);
  }, [computedFrom, computedTo, ctrl]);

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
            <View style={styles.cardSection}>
              <ChartSkeleton />
            </View>
          ) : (
            <View style={styles.cardSection}>
              <View style={styles.calendarHeader}>
                <Pressable onPress={() => shiftMonth(-1)} style={styles.navBtn}>
                  <Ionicons name="chevron-back" size={16} color={(colors as any).text} />
                </Pressable>
                <Text style={styles.sectionTitle}>{calendarMonthLabel}</Text>
                <Pressable onPress={() => shiftMonth(1)} style={styles.navBtn}>
                  <Ionicons name="chevron-forward" size={16} color={(colors as any).text} />
                </Pressable>
              </View>
              <View style={styles.weekdaysRow}>
                {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((w) => (
                  <Text key={w} style={styles.weekdayLabel}>{w}</Text>
                ))}
              </View>
              <View style={styles.weeksContainer}>
                {calendarWeeks.map((week, wi) => (
                  <View key={wi} style={styles.weekRow}>
                    {week.map((d, di) => {
                      const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                      const key = `${dayKey}-${wi}-${di}`;
                      const inMonth = d.getMonth() === calendarMonth.getMonth();
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const scans = scansPerDay.get(dayKey) || 0;
                      const ts = d.getTime();
                      const startTs = rangeStart?.getTime();
                      const endTs = rangeEnd?.getTime();
                      const rangeLo = startTs && endTs ? Math.min(startTs, endTs) : startTs;
                      const rangeHi = startTs && endTs ? Math.max(startTs, endTs) : endTs;
                      const inRange = rangeLo != null && rangeHi != null && ts >= rangeLo && ts <= rangeHi;
                      const isStart = startTs != null && ts === startTs;
                      const isEnd = endTs != null && ts === endTs;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => handleDaySelect(d)}
                          style={({ pressed }) => [
                            styles.dayCell,
                            !inMonth && styles.dayCellMuted,
                            scans > 0 && styles.dayCellActive,
                            inRange && styles.dayCellRange,
                            isStart && styles.dayCellStart,
                            isEnd && styles.dayCellEnd,
                            pressed && styles.dayCellPressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayNum,
                              isWeekend && inMonth ? styles.dayWeekend : null,
                              !inMonth ? styles.dayMutedText : null,
                            ]}
                          >
                            {d.getDate()}
                          </Text>
                          {scans > 0 && <View style={styles.dot} />}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
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
            paddingTop: 16 + headerTopInset,
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
    cardSection: {
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      backgroundColor: colors.cardBackground,
      gap: 8,
    },
    calendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    navBtn: {
      height: 30, width: 30, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB',
      alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
    },
    weeksContainer: {
      gap: 4,
      marginTop: 4,
      width: 7 * 40 + 6 * 6,
      alignSelf: 'center',
    },
    weekRow: { flexDirection: 'row', gap: 6 },
    weekdaysRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 4,
      marginBottom: 2,
      width: 7 * 40 + 6 * 6,
      alignSelf: 'center',
    },
    weekdayLabel: { width: 40, textAlign: 'center', color: colors.secondaryText, fontWeight: '700', fontSize: 11 },
    dayCell: {
      width: 40,
      height: 40,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
    },
    dayCellMuted: { opacity: 0.45 },
    dayCellActive: { borderColor: colors.tint },
    dayCellRange: { backgroundColor: colors.tint + '12' },
    dayCellStart: { borderColor: colors.tint, backgroundColor: colors.tint + '22' },
    dayCellEnd: { borderColor: colors.tint, backgroundColor: colors.tint + '22' },
    dayCellPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
    dayNum: { fontSize: 11, fontWeight: '800', color: colors.text },
    dayWeekend: { color: '#DC2626' },
    dayMutedText: { color: colors.secondaryText },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#3B82F6',
      marginTop: 2,
    },
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
