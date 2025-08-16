// components/QRcodes/Analytics/Heatmap.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    LayoutChangeEvent,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

// ===== Типы входных данных
export type HeatCell = {
  date: string | Date;   // дата дня
  value: number;         // количество сканов за день
  note?: string;
  sid?: string;
};

export type HeatEvent = {
  ts: Date | string;     // момент сканирования
  city?: string;
  title?: string;        // например "iPhone • Safari"
};

type Props = {
  data: HeatCell[];                   // значения по дням
  events?: HeatEvent[];               // сырые события для правого списка
  from: Date;                         // границы календаря
  to: Date;

  palette?: 'auto' | 'blue' | 'green' | 'purple' | string[];
  scaleMode?: 'absolute' | 'local';   // абсолютная шкала или локальная (по видимому диапазону)
  highlightWeekends?: boolean;        // подсветка выходных (рамкой)
  showLegend?: boolean;

  // колбэк на завершённый выбор диапазона длинным нажатием
  onRangeChange?: (r: { from: Date; to: Date; sum: number }) => void;

  // размеры
  cellGap?: number;     // расстояние между ячейками (px)
  minCellSize?: number; // минимальная сторона ячейки
  maxCellSize?: number; // максимальная сторона ячейки
};

// ===== Утилиты дат
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const addDays    = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isSameDay  = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth   = (d: Date) => new Date(d.getFullYear(), d.getMonth()+1, 0);
const daysInMonth  = (y: number, m: number) => new Date(y, m+1, 0).getDate();

const MON_FIRST = true; // неделя начинается с понедельника
const getWeekdayIndex = (d: Date) => {
  const idx = d.getDay(); // 0 = Вс .. 6 = Сб
  return MON_FIRST ? ((idx + 6) % 7) : idx;
};

const monthName = (m: number) =>
  ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'][m];

const shortMonth = (m: number) =>
  ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][m];

const WDAYS = MON_FIRST
  ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
  : ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime())/(1000*60*60*24));

// ===== Палитры
const PRESETS: Record<'blue'|'green'|'purple', string[]> = {
  blue:   ['#EEF2FF', '#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1'],
  green:  ['#ECFDF5', '#A7F3D0', '#6EE7B7', '#34D399', '#10B981'],
  purple: ['#F5F3FF', '#E9D5FF', '#C4B5FD', '#A78BFA', '#8B5CF6'],
};

// ===== Компонент
export default function Heatmap({
  data,
  events = [],
  from,
  to,
  palette = 'auto',
  scaleMode = 'absolute',
  highlightWeekends = true,
  showLegend = false,
  onRangeChange,
  cellGap = 4,
  minCellSize = 28,
  maxCellSize = 44,
}: Props) {
  // ширина контейнера для адаптивных размеров
  const [wrapW, setWrapW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWrapW(e.nativeEvent.layout.width);

  // значения по дням (Map на весь вход)
  const valuesByDay = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach(d => {
      const dt = d.date instanceof Date ? d.date : new Date(d.date);
      const key = toKey(dt);
      map.set(key, (map.get(key) || 0) + (d.value || 0));
    });
    return map;
  }, [data]);

  // максимум для шкалы
  const maxAll = useMemo(() => Math.max(1, ...data.map(d => d.value || 0)), [data]);
  const maxLocal = useMemo(() => {
    let m = 1;
    // локальный максимум только по видимому диапазону
    for (let i = 0; i <= dayDiff(from, to); i++) {
      const d = addDays(from, i);
      m = Math.max(m, valuesByDay.get(toKey(d)) || 0);
    }
    return m;
  }, [from, to, valuesByDay]);
  const maxValue = scaleMode === 'absolute' ? maxAll : maxLocal;

  // палитра
  const paletteArr: string[] = Array.isArray(palette)
    ? palette
    : palette === 'green' ? PRESETS.green
    : palette === 'purple' ? PRESETS.purple
    : PRESETS.blue;

  const colorFor = (v: number) => {
    if (v <= 0) return paletteArr[0];
    const idx = clamp(Math.floor((v / maxValue) * (paletteArr.length - 1)), 0, paletteArr.length - 1);
    return paletteArr[idx];
  };

  // массив месяцев в пределах [from..to]
  const months: Array<{ y: number; m: number; start: Date; end: Date }> = useMemo(() => {
    const res: Array<{ y: number; m: number; start: Date; end: Date }> = [];
    let cursor = startOfMonth(from);
    const finalM = startOfMonth(to);
    while (cursor <= finalM) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      res.push({ y, m, start: new Date(y, m, 1), end: endOfMonth(cursor) });
      cursor = new Date(y, m + 1, 1);
    }
    return res;
  }, [from, to]);

  // выбор (день или диапазон)
  const [tip, setTip] = useState<{ date: Date; value: number } | null>(null);
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [rangeSum, setRangeSum] = useState(0);

  const clearSelection = () => { setTip(null); setRangeStart(null); setRangeEnd(null); setRangeSum(0); };

  const computeSum = (a: Date, b: Date) => {
    const s = a <= b ? a : b;
    const e = a <= b ? b : a;
    let sum = 0;
    for (let i = 0; i <= dayDiff(s, e); i++) {
      sum += valuesByDay.get(toKey(addDays(s, i))) || 0;
    }
    return sum;
  };

  // события -> нормализуем в дате
  const eventsNorm = useMemo(() => {
    return events.map(e => ({
      ts: e.ts instanceof Date ? e.ts : new Date(e.ts),
      city: e.city,
      title: e.title,
    }));
  }, [events]);

  // отфильтрованные события под выбранный день / диапазон (или весь диапазон, если ничего не выбрано)
  const filteredEvents = useMemo(() => {
    const s = rangeStart ? startOfDay(rangeStart) : (tip ? startOfDay(tip.date) : startOfDay(from));
    const e = rangeEnd   ? endOfDay(rangeEnd)     : (tip ? endOfDay(tip.date)     : endOfDay(to));

    return eventsNorm
      .filter(ev => ev.ts >= s && ev.ts <= e)
      .sort((a,b) => b.ts.getTime() - a.ts.getTime()); // свежие сверху
  }, [eventsNorm, tip, rangeStart, rangeEnd, from, to]);

  // === Рендер одной календарной сетки месяца
  const renderMonth = (y: number, m: number, containerWidth: number) => {
    // отступы и размеры
    const horizontalPadding = 12;
    const usableW = Math.max(0, containerWidth - horizontalPadding*2);

    const cols = 7; // дни недели
    const cellW = clamp(
      Math.floor((usableW - cellGap*(cols-1)) / cols),
      minCellSize,
      maxCellSize
    );
    const gridW = cols*cellW + (cols-1)*cellGap;

    // высчитываем ячейки (6 строк по 7 — классическая сетка календаря)
    const first = new Date(y, m, 1);
    const last  = endOfMonth(first);
    const total = daysInMonth(y, m);

    const leadBlank = getWeekdayIndex(first); // сколько пустых ячеек в первой неделе
    const cells: Array<{ d: Date | null; key: string }> = [];

    // 6 недель * 7 дней = 42
    const TOTAL_CELLS = 42;
    for (let i = 0; i < TOTAL_CELLS; i++) {
      const dayIdx = i - leadBlank + 1; // номер дня месяца
      if (dayIdx < 1 || dayIdx > total) {
        cells.push({ d: null, key: `empty-${y}-${m}-${i}` });
      } else {
        const d = new Date(y, m, dayIdx);
        cells.push({ d, key: `d-${y}-${m}-${dayIdx}` });
      }
    }

    const rows = 6;
    const cellH = cellW; // квадраты
    const gridH = rows*cellH + (rows-1)*cellGap;

    return (
      <View key={`month-${y}-${m}`} style={{ marginBottom: 12 }}>
        {/* Заголовок месяца */}
        <Text style={styles.monthTitle}>
          {monthName(m)} {y}
        </Text>

        {/* Шапка дней недели */}
        <View style={[styles.weekHeader, { width: gridW, marginHorizontal: horizontalPadding }]}>
          {WDAYS.map((w, i) => (
            <Text key={i} style={[styles.wday, { width: cellW }]} numberOfLines={1}>
              {w}
            </Text>
          ))}
        </View>

        {/* Сетка */}
        <View style={{ width: gridW, marginHorizontal: horizontalPadding }}>
          {Array.from({ length: rows }).map((_, r) => (
            <View key={`r-${r}`} style={{ flexDirection: 'row', marginBottom: r === rows-1 ? 0 : cellGap }}>
              {cells.slice(r*cols, r*cols + cols).map((c, idx) => {
                if (!c.d) {
                  return <View key={c.key} style={{ width: cellW, height: cellH, marginRight: idx===cols-1 ? 0 : cellGap }} />;
                }

                const key = toKey(c.d);
                const value = valuesByDay.get(key) || 0;
                const bg = colorFor(value);
                const dayNum = c.d.getDate();
                const weekend = [5,6].includes(getWeekdayIndex(c.d)); // Сб/Вс для MON_FIRST

                const inRange = rangeStart && rangeEnd
                  ? ((rangeStart <= c.d && c.d <= rangeEnd) || (rangeEnd <= c.d && c.d <= rangeStart))
                  : false;

                const isSelectedDay = tip && isSameDay(tip.date, c.d);

                return (
                  <Pressable
                    key={c.key}
                    onPress={() => {
                      setRangeStart(null);
                      setRangeEnd(null);
                      setRangeSum(0);
                      setTip({ date: c.d!, value });
                    }}
                    onLongPress={() => {
                      if (!rangeStart) {
                        setTip({ date: c.d!, value });
                        setRangeStart(c.d!);
                      } else {
                        setRangeEnd(c.d!);
                        const sum = computeSum(rangeStart, c.d!);
                        setRangeSum(sum);
                        onRangeChange?.({
                          from: rangeStart <= c.d! ? rangeStart : c.d!,
                          to:   rangeStart <= c.d! ? c.d! : rangeStart,
                          sum,
                        });
                      }
                    }}
                    delayLongPress={420}
                    style={({ pressed }) => [
                      styles.cell,
                      {
                        width: cellW,
                        height: cellH,
                        marginRight: idx===cols-1 ? 0 : cellGap,
                        backgroundColor: bg,
                        borderColor: inRange ? '#111827' : (highlightWeekends && weekend ? '#FCA5A5' : '#E5E7EB'),
                        borderWidth: inRange || (highlightWeekends && weekend) ? 1 : 0.5,
                        transform: pressed ? [{ scale: 0.98 }] : undefined,
                      },
                      isSelectedDay && { borderColor: '#374151', borderWidth: 1.5 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        { color: '#111827', fontSize: Math.max(10, Math.floor(cellW * 0.30)) },
                      ]}
                      numberOfLines={1}
                    >
                      {dayNum}
                    </Text>
                    {/* маленький бейдж с количеством (если влезает) */}
                    {cellW >= 36 && value > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText} numberOfLines={1}>{value}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    );
  };

  // ширина занимает всю строку — месяцы идут столбцом
  const gridBlock = (
    <View>
      {months.map(m => renderMonth(m.y, m.m, wrapW))}
    </View>
  );

  // индикация выбранного состояния
  const selectionInfo = (
    <View style={styles.selectionBar}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="information-circle-outline" size={16} color="#374151" />
        {!rangeStart && !rangeEnd && !tip && (
          <Text style={styles.infoText}>Совет: нажмите на день чтобы посмотреть данные, зажмите — чтобы начать выбор диапазона</Text>
        )}
        {tip && !rangeStart && !rangeEnd && (
          <Text style={styles.infoText}>
            {tip.date.toLocaleDateString()} • {tip.value} сканирований
          </Text>
        )}
        {rangeStart && !rangeEnd && (
          <Text style={styles.infoText}>
            Начало периода: {rangeStart.toLocaleDateString()} (зажмите конечный день, чтобы завершить)
          </Text>
        )}
        {rangeStart && rangeEnd && (
          <Text style={styles.infoText}>
            Период: { (rangeStart <= rangeEnd ? rangeStart : rangeEnd).toLocaleDateString() }
            {' — '}
            { (rangeStart <= rangeEnd ? rangeEnd : rangeStart).toLocaleDateString() }
            {' • Сумма: '}{rangeSum}
          </Text>
        )}
      </View>

      {(tip || rangeStart || rangeEnd) && (
        <Pressable onPress={clearSelection} style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="close" size={14} color="#111827" />
        </Pressable>
      )}
    </View>
  );

  return (
    <View onLayout={onLayout} style={styles.card}>
      {/* Календарная сетка (вся ширина) */}
      {gridBlock}

      {/* Информация о выбранном дне/периоде */}
      {selectionInfo}

      {/* Список активностей (прокручиваемый) */}
      <View style={styles.eventsBox}>
        <View style={styles.eventsHeader}>
          <Text style={styles.eventsTitle}>Активность</Text>
          <Text style={styles.eventsHint}>Список ограничен выбранным днём или диапазоном</Text>
        </View>

        <View style={{ maxHeight: 300 }}>
          <ScrollView showsVerticalScrollIndicator contentContainerStyle={{ paddingBottom: 8 }}>
            {filteredEvents.length === 0 ? (
              <Text style={{ color: '#6B7280', fontSize: 12 }}>Нет событий за выбранный период</Text>
            ) : (
              filteredEvents.map((ev, i) => (
                <View key={`${ev.ts instanceof Date ? ev.ts.getTime() : i}-${i}`} style={styles.eventRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle} numberOfLines={1}>
                      {ev.title || 'Сканирование'}
                    </Text>
                    <Text style={styles.eventSub} numberOfLines={1}>
                      {(ev.ts instanceof Date ? ev.ts : new Date(ev.ts)).toLocaleString()}
                      {ev.city ? ` • ${ev.city}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
                </View>
              ))
            )}
          </ScrollView>
        </View>

        {showLegend && (
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: '#6B7280', fontSize: 12 }}>Меньше</Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {paletteArr.map((c, i) => (
                <View key={i} style={{ width: 18, height: 8, borderRadius: 3, backgroundColor: c, borderWidth: 1, borderColor: '#E5E7EB' }} />
              ))}
            </View>
            <Text style={{ color: '#6B7280', fontSize: 12 }}>Больше</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ===== Стили
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF2FF',
    padding: 12,
    ...Platform.select({
      web:  { boxShadow: '0 6px 18px rgba(0,0,0,0.06)' },
      ios:  { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 2 },
    }),
  },

  monthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    paddingHorizontal: 12,
  },

  weekHeader: {
    flexDirection: 'row',
    marginBottom: 6,
    justifyContent: 'space-between',
  },
  wday: {
    color: '#6B7280',
    fontSize: 11,
    textAlign: 'center',
  },

  cell: {
    borderRadius: 8,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: 6,
    position: 'relative',
  },
  dayNum: {
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    minWidth: 18,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(17,24,39,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    color: '#111827',
    fontWeight: '700',
  },

  selectionBar: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  infoText: { color: '#374151', fontSize: 12 },
  clearBtn: {
    height: 28,
    width: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  eventsBox: { marginTop: 12 },
  eventsHeader: { marginBottom: 8, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  eventsTitle: { color: '#111827', fontWeight: '800' },
  eventsHint: { color: '#6B7280', fontSize: 11 },
  eventRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEF2FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  eventTitle: { color: '#111827', fontWeight: '700' },
  eventSub:   { color: '#6B7280', fontSize: 12 },
});
