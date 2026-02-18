import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';

import { SkeletonBlock } from '@/components/Home/HomeSkeleton';
import type { HomeMetricState, HomeSeriesPoint } from '@/src/entities/home/types';

type Props = {
  series: HomeSeriesPoint[];
  state: HomeMetricState;
  message?: string;
  onPress?: () => void;
  disabled?: boolean;
};

function buildPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return '';
  return points.map((pt, index) => `${index === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

function dayLabel(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(+d)) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export default function HomeScansMiniChart({ series, state, message, onPress, disabled }: Props) {
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = React.useState(0);
  const contentWidth = Math.max(0, width - 24);
  const chartHeight = 136;
  const chartPadding = { left: 8, right: 8, top: 10, bottom: 16 };
  const innerWidth = Math.max(1, contentWidth - chartPadding.left - chartPadding.right);
  const innerHeight = chartHeight - chartPadding.top - chartPadding.bottom;

  const safeSeries = React.useMemo(
    () =>
      series
        .filter((point) => point && point.ts)
        .sort((a, b) => +new Date(a.ts) - +new Date(b.ts))
        .slice(-7),
    [series]
  );

  const values = safeSeries.map((item) => Number(item.scans || 0));
  const max = Math.max(1, ...values);
  const total = values.reduce((acc, val) => acc + val, 0);
  const peak = values.length ? Math.max(...values) : 0;

  const points = safeSeries.map((item, index) => {
    const ratioX = safeSeries.length > 1 ? index / (safeSeries.length - 1) : 0;
    const x = chartPadding.left + ratioX * innerWidth;
    const y = chartPadding.top + (1 - Number(item.scans || 0) / max) * innerHeight;
    return { x, y, ts: item.ts, scans: Number(item.scans || 0) };
  });

  const linePath = buildPath(points);
  const areaPath = `${linePath} L ${chartPadding.left + innerWidth} ${
    chartPadding.top + innerHeight
  } L ${chartPadding.left} ${chartPadding.top + innerHeight} Z`;

  const onLayout = (evt: LayoutChangeEvent) => {
    setWidth(evt.nativeEvent.layout.width);
  };

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeInUp.delay(140).duration(420)} onLayout={onLayout}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        style={(state: any) => [
          styles.card,
          state.hovered ? styles.cardHovered : null,
          state.pressed && !disabled ? styles.cardPressed : null,
          disabled ? styles.cardDisabled : null,
        ]}
        accessibilityRole={onPress && !disabled ? 'button' : undefined}
        accessibilityLabel="Открыть аналитику QR"
      >
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Ionicons name="pulse-outline" size={18} color="#4F46E5" />
          <Text style={styles.title}>Сканы за 7 дней</Text>
        </View>
        <View style={styles.badges}>
          <Text style={styles.badge}>Всего: {total}</Text>
          <Text style={styles.badge}>Пик: {peak}</Text>
        </View>
      </View>

      {state === 'loading' ? (
        <View style={{ gap: 10 }}>
          <SkeletonBlock height={136} radius={12} />
          <SkeletonBlock height={14} width="58%" radius={8} />
        </View>
      ) : null}

      {state === 'locked' ? (
        <View style={styles.statusWrap}>
          <Ionicons name="lock-closed-outline" size={16} color="#64748B" />
          <Text style={styles.statusText}>{message || 'Недостаточно прав для аналитики QR'}</Text>
        </View>
      ) : null}

      {state === 'error' ? (
        <View style={styles.statusWrap}>
          <Ionicons name="warning-outline" size={16} color="#B91C1C" />
          <Text style={[styles.statusText, { color: '#B91C1C' }]}>
            {message || 'Ошибка загрузки графика'}
          </Text>
        </View>
      ) : null}

      {state === 'ready' ? (
        safeSeries.length ? (
          <View style={{ gap: 8 }}>
            <Svg width={contentWidth} height={chartHeight}>
              <Defs>
                <SvgLinearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#6366F1" stopOpacity={0.46} />
                  <Stop offset="100%" stopColor="#6366F1" stopOpacity={0.04} />
                </SvgLinearGradient>
              </Defs>

              <Path d={areaPath} fill="url(#chartFill)" />
              <Path d={linePath} stroke="#4F46E5" strokeWidth={3} fill="none" />
              {points.map((point) => (
                <Circle key={`${point.ts}-${point.x}`} cx={point.x} cy={point.y} r={3.4} fill="#4338CA" />
              ))}
            </Svg>

            <View style={styles.labelsRow}>
              <Text style={styles.labelText}>{dayLabel(safeSeries[0].ts)}</Text>
              <Text style={styles.labelText}>{dayLabel(safeSeries[safeSeries.length - 1].ts)}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyText}>За выбранный период нет сканов</Text>
        )
      ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    ...(Platform.OS === 'android' ? { elevation: 3 } : null),
  },
  cardHovered: {
    borderColor: '#60A5FA',
    transform: [{ translateY: -1 }],
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    ...(Platform.OS === 'android' ? { elevation: 7 } : null),
  },
  cardPressed: {
    transform: [{ scale: 0.995 }],
    opacity: 0.96,
  },
  cardDisabled: {
    opacity: 0.78,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  statusWrap: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    flex: 1,
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
  },
});
