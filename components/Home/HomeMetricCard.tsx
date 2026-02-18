import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';

import type { HomeMetricCard as HomeMetricCardType } from '@/src/entities/home/types';
import { SkeletonBlock } from '@/components/Home/HomeSkeleton';

type Props = {
  metric: HomeMetricCardType;
  delay?: number;
  onPress?: () => void;
  compact?: boolean;
};

const TONE_COLORS = {
  neutral: { bg: '#F8FAFC', border: '#CBD5E1', accent: '#334155' },
  info: { bg: '#EFF6FF', border: '#BFDBFE', accent: '#1D4ED8' },
  success: { bg: '#ECFDF5', border: '#A7F3D0', accent: '#047857' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', accent: '#B45309' },
  danger: { bg: '#FEF2F2', border: '#FECACA', accent: '#B91C1C' },
} as const;

const numberFormatter = new Intl.NumberFormat('ru-RU');

function AnimatedNumber({
  value,
  reducedMotion,
  compact,
}: {
  value: number;
  reducedMotion: boolean;
  compact: boolean;
}) {
  const [display, setDisplay] = React.useState<number>(value);
  const rafRef = React.useRef<number | null>(null);
  const displayRef = React.useRef<number>(value);

  React.useEffect(() => {
    displayRef.current = display;
  }, [display]);

  React.useEffect(() => {
    if (reducedMotion) {
      setDisplay(value);
      return;
    }
    const from = displayRef.current;
    const to = value;
    if (from === to) return;

    const duration = 450;
    const start = Date.now();

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (to - from) * eased);
      setDisplay(next);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion, value]);

  return (
    <Text style={[styles.value, compact ? styles.valueCompact : null]}>
      {numberFormatter.format(display)}
    </Text>
  );
}

export default function HomeMetricCard({ metric, delay = 0, onPress, compact = false }: Props) {
  const reducedMotion = useReducedMotion();
  const tone = TONE_COLORS[metric.tone];
  const isInteractive = typeof onPress === 'function' && metric.state === 'ready';

  const content = (
    <View style={[styles.content, compact ? styles.contentCompact : null]}>
      <View style={[styles.header, compact ? styles.headerCompact : null]}>
        <View style={[styles.iconWrap, compact ? styles.iconWrapCompact : null, { backgroundColor: tone.accent }]}>
          <Ionicons name={metric.icon as any} size={compact ? 14 : 16} color="#FFFFFF" />
        </View>
        <Text style={[styles.title, compact ? styles.titleCompact : null]}>{metric.title}</Text>
      </View>

      {metric.state === 'loading' ? (
        <SkeletonBlock height={compact ? 22 : 28} width={compact ? 62 : 72} radius={8} />
      ) : null}
      {metric.state === 'ready' ? (
        <AnimatedNumber
          compact={compact}
          reducedMotion={Boolean(reducedMotion)}
          value={Number(metric.value || 0)}
        />
      ) : null}
      {metric.state === 'locked' ? (
        <View style={[styles.stateRow, compact ? styles.stateRowCompact : null]}>
          <Ionicons name="lock-closed-outline" size={compact ? 12 : 14} color="#64748B" />
          <Text style={[styles.stateText, compact ? styles.stateTextCompact : null]}>Недоступно</Text>
        </View>
      ) : null}
      {metric.state === 'error' ? (
        <View style={[styles.stateRow, compact ? styles.stateRowCompact : null]}>
          <Ionicons name="warning-outline" size={compact ? 12 : 14} color="#DC2626" />
          <Text style={[styles.stateText, compact ? styles.stateTextCompact : null, { color: '#B91C1C' }]}>
            Ошибка
          </Text>
        </View>
      ) : null}

      <Text numberOfLines={2} style={[styles.description, compact ? styles.descriptionCompact : null]}>
        {metric.hint?.trim() ? metric.hint : metric.description}
      </Text>
    </View>
  );

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeInUp.delay(delay).duration(420)}>
      <Pressable
        style={(state: any) => [
          styles.card,
          compact ? styles.cardCompact : null,
          { backgroundColor: tone.bg, borderColor: tone.border },
          state.hovered ? styles.hovered : null,
          state.pressed && isInteractive ? styles.pressed : null,
        ]}
        onPress={isInteractive ? onPress : undefined}
        accessibilityRole={isInteractive ? 'button' : undefined}
        accessibilityLabel={`${metric.title}: ${
          metric.state === 'ready' ? numberFormatter.format(Number(metric.value || 0)) : metric.state
        }`}
      >
        {content}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 130,
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    ...(Platform.OS === 'android' ? { elevation: 3 } : null),
  },
  cardCompact: {
    minHeight: 108,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  hovered: {
    borderColor: '#2563EB',
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    ...(Platform.OS === 'android' ? { elevation: 7 } : null),
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  content: {
    gap: 8,
  },
  contentCompact: {
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerCompact: {
    gap: 7,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapCompact: {
    width: 20,
    height: 20,
    borderRadius: 7,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  titleCompact: {
    fontSize: 12.5,
  },
  value: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    color: '#020617',
  },
  valueCompact: {
    fontSize: 22,
    lineHeight: 25,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    color: '#475569',
  },
  descriptionCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  stateRowCompact: {
    marginTop: 0,
    gap: 5,
  },
  stateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  stateTextCompact: {
    fontSize: 11,
  },
});
