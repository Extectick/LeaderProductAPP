import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';

type Totals = { scans: number; uniqueIPs: number; uniqueDevices: number };

type Props = {
  totals?: Totals;
  colors: any;
  onPress?: (key: keyof Totals) => void;
  /** мини-ряды для вспомогательных вещей (тренд, спарклайн) */
  mini?: Partial<Record<keyof Totals, number[]>>;
  loading?: boolean;
};

/** 1к / 1.1к / 1м / 1.1м */
const compactRu = (n: number) => {
  const fmt = (x: number, suf: string) =>
    (x % 1 === 0 ? x.toFixed(0) : x.toFixed(1)).replace(/\.0$/, '') + suf;
  if (n >= 1_000_000) return fmt(n / 1_000_000, 'м');
  if (n >= 1_000) return fmt(n / 1_000, 'к');
  return String(n);
};

export default function MetricsRow({ totals, colors, onPress, mini, loading }: Props) {
  const items = useMemo(
    () => [
      {
        key: 'scans' as const,
        title: 'Сканы',
        icon: 'qr-code-outline' as const,
        value: totals?.scans ?? 0,
        accent: '#3B82F6',
        series: mini?.scans,
        showTrend: true,
      },
      {
        key: 'uniqueIPs' as const,
        title: 'Уник. IP',
        icon: 'globe-outline' as const,
        value: totals?.uniqueIPs ?? 0,
        accent: '#10B981',
        series: mini?.uniqueIPs,
        showTrend: false,
      },
      {
        key: 'uniqueDevices' as const,
        title: 'Устройства',
        icon: 'hardware-chip-outline' as const,
        value: totals?.uniqueDevices ?? 0,
        accent: '#8B5CF6',
        series: mini?.uniqueDevices,
        showTrend: false,
      },
    ],
    [totals, mini]
  );

  return (
    <View style={styles.row}>
      {items.map((it, idx) => (
        <MetricCard
          key={it.key}
          idx={idx}
          title={it.title}
          icon={it.icon}
          value={it.value}
          accent={it.accent}
          colors={colors}
          loading={!!loading}
          series={it.series}
          onPress={() => onPress?.(it.key)}
          showTrend={it.showTrend}
        />
      ))}
    </View>
  );
}

/* ----------------------- ВНУТРЕННЯЯ КАРТОЧКА ----------------------- */

type CardProps = {
  idx: number;
  title: string;
  icon: any;
  value: number;
  accent: string;
  colors: any;
  loading: boolean;
  series?: number[];
  showTrend?: boolean;
  onPress?: () => void;
};

function MetricCard({
  idx, title, icon, value, accent, colors, loading, series, showTrend, onPress,
}: CardProps) {
  // тренд только для "Сканы": по двум последним точкам мини-серии
  const trend: 'up' | 'down' | 'flat' = useMemo(() => {
    if (!showTrend || !series || series.length < 2) return 'flat';
    const a = series[series.length - 2] ?? 0;
    const b = series[series.length - 1] ?? 0;
    if (b > a) return 'up';
    if (b < a) return 'down';
    return 'flat';
  }, [series, showTrend]);

  const press = useRef(new Animated.Value(0)).current;
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });
  const bg = press.interpolate({ inputRange: [0, 1], outputRange: [colors.cardBackground, '#EEF2FF'] });
  const border = press.interpolate({ inputRange: [0, 1], outputRange: ['#EEF2FF', '#C7D2FE'] });

  const onIn = () => Animated.timing(press, { toValue: 1, duration: 80, useNativeDriver: false }).start();
  const onOut = () => Animated.timing(press, { toValue: 0, duration: 120, useNativeDriver: false }).start();

  const trendIcon = trend === 'up' ? 'arrow-up' : trend === 'down' ? 'arrow-down' : null;
  const trendColor = trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#9CA3AF';

  return (
    <Pressable
      onPressIn={onIn}
      onPressOut={() => {
        onOut();
        onPress?.();
      }}
      android_ripple={{ color: '#E5E7EB' }}
      style={[styles.pressWrap, { marginRight: idx === 2 ? 0 : 8 }]}
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: bg as any,
            borderColor: border as any,
            transform: [{ scale: scale as any }],
          },
        ]}
      >
        {/* иконка — сверху слева */}
        <View style={styles.iconTopLeft}>
          <View style={[styles.iconPill, { borderColor: '#E5E7EB', backgroundColor: '#F3F4F6' }]}>
            <Ionicons name={icon} size={13} color="#111827" />
          </View>
        </View>

        {/* заголовок — сверху по центру (меньший) */}
        <Text numberOfLines={2} style={[styles.titleTop, { color: colors.secondaryText }]}>
          {title}
        </Text>

        {/* значение — строго по центру карточки */}
        <View style={styles.valueCenter}>
          {loading ? (
            <View style={styles.skelValue} />
          ) : (
            <Text style={[styles.value, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {compactRu(value)}
            </Text>
          )}

          {/* индикатор тренда для "Сканы" */}
          {showTrend && trendIcon && (
            <View style={styles.trendRow}>
              <Ionicons name={trendIcon as any} size={14} color={trendColor} />
              {/* можно добавить подпись, если понадобится */}
            </View>
          )}
        </View>

        {/* мини-спарклайн под числом (если есть серия) */}
        {series && series.length >= 2 ? <Spark series={series} stroke={accent} /> : <View style={{ height: 22 }} />}
      </Animated.View>
    </Pressable>
  );
}

/* ----------------------------- СПАРКЛАЙН ----------------------------- */

function Spark({ series, stroke = '#3B82F6' }: { series: number[]; stroke?: string }) {
  const w = 64, h = 22, pad = 2;
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const span = Math.max(max - min, 1);
  const stepX = (w - pad * 2) / (series.length - 1);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const x = (i: number) => pad + i * stepX;
  const d = series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');

  return (
    <Svg width={w} height={h} style={{ marginTop: 6 }}>
      <Path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

/* ----------------------------- СТИЛИ ----------------------------- */

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 12 },
  pressWrap: {
    flex: 1,
    borderRadius: 14,
    overflow: Platform.OS === 'android' ? 'hidden' : ('visible' as any),
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 92,
  },

  iconTopLeft: { position: 'absolute', top: 10, left: 10 },
  iconPill: {
    height: 22,
    width: 22,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  titleTop: {
    textAlign: 'right',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 13,
    paddingTop: 4,
    minHeight: 13,
  },

  valueCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  value: {
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },

  trendRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center' },

  // скелетон
  skelValue: { height: 28, width: 56, borderRadius: 6, backgroundColor: '#F3F4F6' },
});

