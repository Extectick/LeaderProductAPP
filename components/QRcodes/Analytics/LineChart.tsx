import React, { useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Circle, Line, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';

type Pt = { ts: string; value: number };

type Props = {
  colors: any;
  series: Pt[];
  range: { from: Date; to: Date; bucket: 'hour' | 'day' | 'month' };
  onPointPress?: (pt: Pt) => void;
};

type GridPoint = { x: number; y: number; ts: string; value: number };

const MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

export default function LineChart({ colors, series, range, onPointPress }: Props) {
  const { width } = Dimensions.get('window');
  const chartWidth = Math.min(width - 32, 1000 - 32);
  const chartHeight = 220;
  const padding = { x: 28, y: 18 };

  // равномерная сетка по bucket + агрегация в слоты
  const grid: GridPoint[] = useMemo(() => {
    // сортируем и подготавливаем
    const points = [...series].sort((a, b) => +new Date(a.ts) - +new Date(b.ts));
    const min = range.from.getTime();
    let max = range.to.getTime();

    // шаг по bucket
    const hourMs = 3600 * 1000;
    const dayMs = 24 * hourMs;
    const step = range.bucket === 'hour' ? hourMs : range.bucket === 'day' ? dayMs : dayMs * 30;

    // защита от пустого/некорректного интервала
    if (max <= min) max = min + step;

    // генерируем слоты
    const slots: number[] = [];
    let t = Math.floor(min / step) * step;
    // гарантируем как минимум 2 точки, чтобы линия рисовалась
    while (t <= max) {
      slots.push(t);
      t += step;
    }
    if (slots.length < 2) slots.push(slots[0] + step);

    // суммируем значения по слотам
    const sums = new Map<number, number>();
    for (const p of points) {
      const tt = +new Date(p.ts);
      const bucketStart = Math.floor(tt / step) * step;
      sums.set(bucketStart, (sums.get(bucketStart) || 0) + p.value);
    }

    // размеры области рисования и максимальное значение
    const innerW = chartWidth - padding.x * 2;
    const innerH = chartHeight - padding.y * 2;
    const maxVal = Math.max(1, ...Array.from(sums.values()), 0); // не даём деления на 0

    // строим нормализованные точки
    return slots.map((slot, i) => {
      const x = padding.x + (i / Math.max(slots.length - 1, 1)) * innerW;
      const value = sums.get(slot) ?? 0;
      const y = chartHeight - padding.y - (value / maxVal) * innerH;
      return { x, y, ts: new Date(slot).toISOString(), value };
    });
  }, [series, range, chartWidth]);

  // путь линии
  const pathD = useMemo(() => {
    if (grid.length === 0) return '';
    return grid.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  }, [grid]);

  // подписи оси X (умеренное количество, без наложения)
  const labels = useMemo((): { x: number; text: string }[] => {
    if (grid.length === 0) return [];
    const fmt = (d: Date) => {
      if (range.bucket === 'hour') return `${String(d.getHours()).padStart(2, '0')}:00`;
      if (range.bucket === 'day')  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
      return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    };
    const targetCount = 6; // примерно 6 меток
    const every = Math.max(1, Math.ceil(grid.length / targetCount));
    const filtered = grid.filter((_, i) => i % every === 0 || i === grid.length - 1);
    // если осталась всего одна — добавим ещё край
    if (filtered.length === 1 && grid.length > 1) filtered.unshift(grid[0]);
    return filtered.map((g) => ({ x: g.x, text: fmt(new Date(g.ts)) }));
  }, [grid, range]);

  // hover/tooltip по точке
  const [hover, setHover] = useState<{ ts: string; value: number } | null>(null);

  return (
    <View style={[styles.box, { backgroundColor: colors.cardBackground, borderColor: '#EEF2FF' }]}>
      <Svg width={chartWidth} height={chartHeight}>
        {/* фон */}
        <Rect x={0} y={0} width={chartWidth} height={chartHeight} fill={colors.cardBackground} />

        {/* оси */}
        <Line
          x1={padding.x}
          y1={padding.y}
          x2={padding.x}
          y2={chartHeight - padding.y}
          stroke="#e5e7eb"
          strokeWidth={1}
        />
        <Line
          x1={padding.x}
          y1={chartHeight - padding.y}
          x2={chartWidth - padding.x}
          y2={chartHeight - padding.y}
          stroke="#e5e7eb"
          strokeWidth={1}
        />

        {/* линия либо прямая по нулю */}
        {grid.length > 0 ? (
          <Path d={pathD} stroke="#2563EB" strokeWidth={2} fill="none" />
        ) : (
          <Line
            x1={padding.x}
            x2={chartWidth - padding.x}
            y1={chartHeight - padding.y}
            y2={chartHeight - padding.y}
            stroke="#94A3B8"
            strokeWidth={2}
          />
        )}

        {/* точки с onPress (react-native-svg поддерживает onPress на элементах) */}
        {grid.map((g, i) => (
          <Circle
            key={i}
            cx={g.x}
            cy={g.y}
            r={3.5}
            fill="#2563EB"
            onPress={() => {
              setHover({ ts: g.ts, value: g.value });
              onPointPress?.({ ts: g.ts, value: g.value });
            }}
          />
        ))}

        {/* подписи X */}
        {labels.map((l, idx) => (
          <SvgText
            key={idx}
            x={l.x}
            y={chartHeight - 2}
            fontSize={10}
            fill="#374151"
            textAnchor="middle"
          >
            {l.text}
          </SvgText>
        ))}
      </Svg>

      {/* простой тултип под графиком */}
      {hover && (
        <View style={styles.tooltip}>
          <Text style={{ fontWeight: '700', color: '#111827' }}>{hover.value}</Text>
          <Text style={{ fontSize: 12, color: '#374151' }}>
            {new Date(hover.ts).toLocaleString()}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
  tooltip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
