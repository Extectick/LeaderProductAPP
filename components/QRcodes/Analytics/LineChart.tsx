import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Circle, G, Line, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';

type Pt = { ts: string; value: number };

type Props = {
  colors: any;
  series: Pt[];
  range: { from: Date; to: Date; bucket: 'hour' | 'day' | 'month' };
  onPointPress?: (pt: Pt) => void;
  onZoomRequest?: (z: { from: Date; to: Date }) => void;
  isZoomed?: boolean;
  onZoomClear?: () => void;
};

type GridPoint = { x: number; y: number; ts: string; value: number };

const MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const CHART_PADDING = { left: 28, right: 10, top: 14, bottom: 24 } as const;

function niceStep(raw: number) {
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const n = raw / base;
  if (n <= 1) return 1 * base;
  if (n <= 2) return 2 * base;
  if (n <= 5) return 5 * base;
  return 10 * base;
}

export default function LineChart({
  colors,
  series,
  range,
  onPointPress,
  onZoomRequest,
  isZoomed = false,
  onZoomClear,
}: Props) {
  // ——— реальная доступная ширина SVG (вписываемся в карточку)
  const [svgW, setSvgW] = useState<number>(0);
  const chartWidth = Math.max(120, svgW || 120);
  const chartHeight = 240;

  const totalDays = Math.max(1, (range.to.getTime() - range.from.getTime()) / (24 * 3600 * 1000));
  const isLongRange = totalDays > 365;

  // ——— сетка/данные
  const { grid, innerW, innerH, maxVal } = useMemo(() => {
    const points = [...series].sort((a, b) => +new Date(a.ts) - +new Date(b.ts));
    const min = range.from.getTime();
    let max = range.to.getTime();

    const H = 3600 * 1000;
    const D = 24 * H;
    const step = range.bucket === 'hour' ? H : range.bucket === 'day' ? D : D * 30;
    if (max <= min) max = min + step;

    const slots: number[] = [];
    let t = Math.floor(min / step) * step;
    while (t <= max) { slots.push(t); t += step; }
    if (slots.length < 2) slots.push(slots[0] + step);

    const sums = new Map<number, number>();
    for (const p of points) {
      const tt = +new Date(p.ts);
      const bucketStart = Math.floor(tt / step) * step;
      sums.set(bucketStart, (sums.get(bucketStart) || 0) + p.value);
    }

    const innerW = chartWidth - CHART_PADDING.left - CHART_PADDING.right;
    const innerH = chartHeight - CHART_PADDING.top - CHART_PADDING.bottom;
    const maxVal = Math.max(1, ...Array.from(sums.values()), 0);

    const grid: GridPoint[] = slots.map((slot, i) => {
      const x = CHART_PADDING.left + (i / Math.max(slots.length - 1, 1)) * innerW;
      const value = sums.get(slot) ?? 0;
      const y = chartHeight - CHART_PADDING.bottom - (value / maxVal) * innerH;
      return { x, y, ts: new Date(slot).toISOString(), value };
    });

    return { grid, innerW, innerH, maxVal };
  }, [series, range, chartWidth]);

  // ——— суммы по годам (для точек по X при длинном периоде)
  const yearSums = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of series) {
      const y = new Date(p.ts).getFullYear();
      map.set(y, (map.get(y) || 0) + (p.value || 0));
    }
    return map;
  }, [series]);

  // ——— шкала Y
  const yTicks = useMemo(() => {
    const target = 4;
    const step = niceStep(maxVal / target);
    const top = Math.ceil(maxVal / step) * step;
    const ticks: number[] = [];
    for (let v = 0; v <= top; v += step) ticks.push(v);
    return { ticks, top };
  }, [maxVal]);

  // ——— путь линии
  const pathD = useMemo(() => {
    if (grid.length === 0) return '';
    return grid.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  }, [grid]);

  // ——— подписи X
  const xLabels = useMemo((): { x: number; text: string; anchor: 'start'|'middle'|'end' }[] => {
    if (grid.length === 0) return [];
    if (isLongRange) {
      const endYear = new Date().getFullYear();
      const years = [endYear - 4, endYear - 3, endYear - 2, endYear - 1, endYear];
      return years.map((y, i) => {
        const frac = years.length === 1 ? 0 : i / (years.length - 1);
        const x = CHART_PADDING.left + frac * innerW;
        let anchor: 'start'|'middle'|'end' = 'middle';
        if (i === 0) anchor = 'start';
        if (i === years.length - 1) anchor = 'end';
        return { x, text: String(y), anchor };
      });
    }
    const fmt = (d: Date) => {
      if (range.bucket === 'hour') return `${String(d.getHours()).padStart(2, '0')}:00`;
      if (range.bucket === 'day')  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
      return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    };
    const targetCount = 6;
    const every = Math.max(1, Math.ceil(grid.length / targetCount));
    const base = grid.filter((_, i) => i % every === 0 || i === grid.length - 1);
    if (base.length === 1 && grid.length > 1) base.unshift(grid[0]);
    return base.map((g, i) => {
      let anchor: 'start'|'middle'|'end' = 'middle';
      if (i === 0) anchor = 'start';
      if (i === base.length - 1) anchor = 'end';
      return { x: g.x, text: fmt(new Date(g.ts)), anchor };
    });
  }, [grid, innerW, isLongRange, range]);

  // ——— нижние точки (для значений 0 или лет без данных)
  const bottomDots = useMemo(() => {
    if (isLongRange) {
      const endYear = new Date().getFullYear();
      const years = [endYear - 4, endYear - 3, endYear - 2, endYear - 1, endYear];
      return years
        .map((y, i) => {
          const sum = yearSums.get(y) || 0;
          if (sum > 0) return null;
          const frac = years.length === 1 ? 0 : i / (years.length - 1);
          const x = CHART_PADDING.left + frac * innerW;
          return { x };
        })
        .filter(Boolean) as { x: number }[];
    }
    return grid.filter(g => g.value === 0).map(g => ({ x: g.x }));
  }, [isLongRange, innerW, grid, yearSums]);

  // ——— интерактивность
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hover, setHover] = useState<{ ts: string; value: number } | null>(null);

  // анимация кружка выбранной точки
  const rAnim = useRef(new Animated.Value(3)).current;
  const animateSelect = () => {
    rAnim.setValue(3);
    Animated.timing(rAnim, { toValue: 7, duration: 150, useNativeDriver: false }).start();
  };
  const selPoint = selectedIdx != null ? grid[selectedIdx] : null;

  // долгий тап — зум
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  const computeZoomFromPoint = (i: number) => {
    const centerMs = +new Date(grid[i].ts);
    const week = 7 * 24 * 3600 * 1000;
    let from = new Date(centerMs - week / 2);
    let to = new Date(centerMs + week / 2);
    const min = range.from.getTime();
    const max = range.to.getTime();
    if (from.getTime() < min) from = new Date(min);
    if (to.getTime() > max) to = new Date(max);
    if (to.getTime() - from.getTime() < week) {
      to = new Date(from.getTime() + week);
      if (to.getTime() > max) {
        to = new Date(max);
        from = new Date(to.getTime() - week);
      }
    }
    return { from, to };
  };

  const handlePressIn = (i: number) => {
    longFired.current = false;
    if (longTimer.current) clearTimeout(longTimer.current);
    longTimer.current = setTimeout(() => {
      longFired.current = true;
      const z = computeZoomFromPoint(i);
      onZoomRequest?.(z);
    }, 500);
  };

  const handlePressOut = (i: number) => {
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
    if (longFired.current) return;
    setSelectedIdx(i);
    setHover({ ts: grid[i].ts, value: grid[i].value });
    animateSelect();
    onPointPress?.({ ts: grid[i].ts, value: grid[i].value });
  };

  // ——— анимации тултипа (ВСЕГДА JS-driver)
  const tipBg = useRef(new Animated.Value(isZoomed ? 1 : 0)).current;
  const tipScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(tipBg, { toValue: isZoomed ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [isZoomed, tipBg]);

  const tipBgColor = tipBg.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', '#DBEAFE'],
  });

  const onTooltipPress = () => {
    if (!selPoint) return;
    Animated.sequence([
      Animated.timing(tipScale, { toValue: 0.98, duration: 80, useNativeDriver: false }),
      Animated.timing(tipScale, { toValue: 1, duration: 120, useNativeDriver: false }),
    ]).start();
    const idx = selectedIdx!;
    const z = computeZoomFromPoint(idx);
    onZoomRequest?.(z);
  };

  useEffect(() => {
    return () => {
      if (longTimer.current) clearTimeout(longTimer.current);
    };
  }, []);

  return (
    <View style={[styles.box, { backgroundColor: colors.cardBackground, borderColor: '#EEF2FF' }]}>
      {/* Измеряем доступную ширину */}
      <View style={{ width: '100%' }} onLayout={(e) => setSvgW(Math.floor(e.nativeEvent.layout.width))}>
        <Svg width={chartWidth} height={chartHeight}>
          {/* фон */}
          <Rect x={0} y={0} width={chartWidth} height={chartHeight} fill={colors.cardBackground} pointerEvents="none" />

          {/* горизонтальные линии + подписи Y */}
          {yTicks.ticks.map((v, idx) => {
            const y = (chartHeight - CHART_PADDING.bottom) - (v / yTicks.top) * innerH;
            return (
              <G key={`yt-${idx}`} pointerEvents="none">
                <Line x1={CHART_PADDING.left} y1={y} x2={chartWidth - CHART_PADDING.right} y2={y} stroke="#e5e7eb" strokeWidth={1} />
                <SvgText x={CHART_PADDING.left - 6} y={y + 3} fontSize={10} fill="#374151" textAnchor="end">
                  {v}
                </SvgText>
              </G>
            );
          })}

          {/* оси */}
          <Line x1={CHART_PADDING.left} y1={CHART_PADDING.top} x2={CHART_PADDING.left} y2={chartHeight - CHART_PADDING.bottom} stroke="#e5e7eb" strokeWidth={1} pointerEvents="none" />
          <Line x1={CHART_PADDING.left} y1={chartHeight - CHART_PADDING.bottom} x2={chartWidth - CHART_PADDING.right} y2={chartHeight - CHART_PADDING.bottom} stroke="#e5e7eb" strokeWidth={1} pointerEvents="none" />

          {/* точки по X для нулевых значений / пустых лет */}
          {bottomDots.map((p, i) => (
            <Circle key={`x-bottom-${i}`} cx={p.x} cy={chartHeight - CHART_PADDING.bottom} r={3} fill="#2563EB" pointerEvents="none" />
          ))}

          {/* линия */}
          {grid.length > 0 ? (
            <Path d={pathD} stroke="#2563EB" strokeWidth={isLongRange ? 1.5 : 2} strokeLinecap="round" strokeLinejoin="round" fill="none" pointerEvents="none" />
          ) : (
            <Line x1={CHART_PADDING.left} x2={chartWidth - CHART_PADDING.right} y1={chartHeight - CHART_PADDING.bottom} y2={chartHeight - CHART_PADDING.bottom} stroke="#94A3B8" strokeWidth={1.5} pointerEvents="none" />
          )}

          {/* кликабельные точки */}
          {grid.map((g, i) => (
            <G key={`pt-${i}`}>
              {/* хит-зона для Android/iOS */}
              <Circle
                cx={g.x}
                cy={g.y}
                r={16}
                fill="#00000001"
                onPressIn={() => handlePressIn(i)}
                onPressOut={() => handlePressOut(i)}
              />
              {/* визуальная точка */}
              {i === selectedIdx ? (
                <AnimatedCircle cx={g.x} cy={g.y} r={rAnim as any} fill="#2563EB" />
              ) : (
                g.value > 0 && <Circle cx={g.x} cy={g.y} r={3} fill="#2563EB" />
              )}
            </G>
          ))}

          {/* подписи X */}
          {xLabels.map((l, idx) => (
            <SvgText key={`xl-${idx}`} x={l.x} y={chartHeight - 6} fontSize={10} fill="#374151" textAnchor={l.anchor}>
              {l.text}
            </SvgText>
          ))}

          {/* маркер выбранной точки + bubble */}
          {selPoint && (
            <G pointerEvents="none">
              <Line x1={selPoint.x} y1={CHART_PADDING.top} x2={selPoint.x} y2={chartHeight - CHART_PADDING.bottom} stroke="#2563EB33" strokeWidth={1} />
              {(() => {
                const text = String(selPoint.value);
                const w = Math.max(36, 8 * text.length + 14);
                const h = 20;
                const x = Math.max(CHART_PADDING.left, Math.min(selPoint.x - w / 2, chartWidth - CHART_PADDING.right - w));
                const y = Math.max(CHART_PADDING.top + 2, selPoint.y - 10 - h);
                return (
                  <>
                    <Rect x={x} y={y} width={w} height={h} rx={6} fill="#FFFFFF" stroke="#2563EB" strokeWidth={1} />
                    <SvgText x={x + w / 2} y={y + 13} fontSize={11} fill="#0B1220" textAnchor="middle" fontWeight="bold">
                      {text}
                    </SvgText>
                  </>
                );
              })()}
            </G>
          )}
        </Svg>
      </View>

      {/* Tooltip (кликабелен для зума) */}
      {hover && (
        <>
          <Pressable onPress={onTooltipPress}>
            <Animated.View
              style={[
                styles.tooltip,
                {
                  maxWidth: chartWidth - 20,
                  backgroundColor: tipBgColor as any,
                  transform: [{ scale: tipScale as any }],
                  borderColor: isZoomed ? '#93C5FD' : '#E5E7EB',
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: '#111827', flexShrink: 1 }} numberOfLines={2}>
                  {hover.value} сканов
                </Text>
                <Text style={{ fontSize: 12, color: '#374151', flexWrap: 'wrap' }}>
                  {new Date(hover.ts).toLocaleString()}
                </Text>
              </View>
              <View style={{ width: 8 }} />
              {isZoomed ? (
                <Pressable onPress={onZoomClear} hitSlop={8} style={styles.iconBtn}>
                  <Ionicons name="close" size={14} color="#0B1220" />
                </Pressable>
              ) : (
                <View style={styles.iconBtn}>
                  <Ionicons name="search" size={14} color="#0B1220" />
                </View>
              )}
            </Animated.View>
          </Pressable>

          {!isZoomed && (
            <View style={styles.hintRow}>
              <Ionicons name="hand-left-outline" size={14} color="#6B7280" />
              <Text style={styles.hintText}>
                Нажмите карточку выше, чтобы детализировать график до недели
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    overflow: 'hidden',
  },
  tooltip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  iconBtn: {
    height: 26,
    width: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  hintRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hintText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#6B7280',
  },
});
