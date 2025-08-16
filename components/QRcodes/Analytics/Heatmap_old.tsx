// components/QRcodes/Analytics/Heatmap.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Rect, Svg } from 'react-native-svg';

type HeatCell = { date: string; value: number };
export default function Heatmap({
  data,
  onCellPress,
  colors = ['#EEF2FF', '#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1'],
  title = 'Активность',
}: {
  data: HeatCell[];
  onCellPress?: (cell: HeatCell) => void;
  colors?: string[];
  title?: string;
}) {
  // нормализация значений
  const max = Math.max(1, ...data.map(d => d.value || 0));
  const level = (v: number) => {
    const idx = Math.min(colors.length - 1, Math.floor((v / max) * (colors.length - 1)));
    return colors[idx];
  };

  // строим сетку: 7 строк (дни недели), столбцы = недели
  // предполагаем, что data уже отсортирована по дате возр.
  const w = 12, h = 12, gap = 2;
  const rows = 7;
  const cols = Math.max(1, Math.ceil(data.length / rows));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Svg width={cols * (w + gap)} height={rows * (h + gap)}>
        {data.map((d, i) => {
          const c = Math.floor(i / rows);
          const r = i % rows;
          const fill = level(d.value || 0);
          return (
            <Rect
              key={`${d.date}-${i}`}
              x={c * (w + gap)}
              y={r * (h + gap)}
              width={w}
              height={h}
              rx={3}
              fill={fill}
              onPress={() => onCellPress?.(d)}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF2FF',
    padding: 12,
  },
  title: { fontWeight: '700', fontSize: 16, marginBottom: 8, color: '#111827' },
});
