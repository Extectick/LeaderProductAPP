import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
    LayoutChangeEvent,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type DayDatum = { date: string | Date; value: number };
type EventItem = { ts: string | Date; city?: string; title?: string };

type Palette = 'auto' | 'blue' | 'green' | 'purple' | string[];

type Props = {
  month: Date;
  data: DayDatum[];
  events?: EventItem[];
  startOfWeek?: 0 | 1;
  palette?: Palette;
  onChangeMonth?: (d: Date) => void;
  onDayPress?: (d: { date: Date; value: number; from: Date; to: Date }) => void;
  onRangeChange?: (r: { from: Date; to: Date; sum: number }) => void;
  highlightWeekends?: boolean;
};

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const toLocalDate = (val: string | Date) => (val instanceof Date ? new Date(val) : new Date(val));
const monthNameRuFull = (m: number) =>
  ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][m];

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth   = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const startOfDay   = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay     = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, n: number) => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; };
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const isBetweenInc = (d: Date, a: Date, b: Date) => {
  const x = d.getTime(), m = Math.min(a.getTime(), b.getTime()), M = Math.max(a.getTime(), b.getTime());
  return x >= m && x <= M;
};

const PALETTES: Record<'blue'|'green'|'purple', string[]> = {
  blue:   ['#EFF6FF','#BFDBFE','#93C5FD','#60A5FA','#3B82F6'],
  green:  ['#ECFDF5','#A7F3D0','#6EE7B7','#34D399','#10B981'],
  purple: ['#F5F3FF','#E9D5FF','#C4B5FD','#A78BFA','#8B5CF6'],
};

export default function MonthHeatmap({
  month,
  data,
  events,
  startOfWeek = 1,
  palette = 'auto',
  onChangeMonth,
  onDayPress,
  onRangeChange,
  highlightWeekends = true,
}: Props) {
  const { theme, themes } = useTheme();
  const colors = themes[theme];

  // размеры сетки
  const [gridW, setGridW] = useState(0);
  const onGridLayout = (e: LayoutChangeEvent) => setGridW(Math.max(0, e.nativeEvent.layout.width));

  const gridStart = useMemo(() => {
    const d0 = startOfMonth(month);
    const jsDay = d0.getDay();
    const shift = (jsDay - startOfWeek + 7) % 7;
    return addDays(d0, -shift);
  }, [month, startOfWeek]);

  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);

  // 1) агрегаты из серии — с переводом на локальное время
  const seriesCountMap = useMemo(() => {
    const mp = new Map<string, number>();
    (data || []).forEach(d => {
      const dt = toLocalDate(d.date);
      const key = ymd(dt);
      const v = Number.isFinite(d.value) ? d.value : 0;
      mp.set(key, (mp.get(key) || 0) + v);
    });
    return mp;
  }, [data]);

  // 2) счётчики из событий — «источник правды»
  const eventCountMap = useMemo(() => {
    const mp = new Map<string, number>();
    (events || []).forEach(ev => {
      const dt = toLocalDate(ev.ts);
      const key = ymd(dt);
      mp.set(key, (mp.get(key) || 0) + 1);
    });
    return mp;
  }, [events]);

  // Если событий есть хотя бы одна запись — рисуем только по ним, иначе — по серии
  const useEventsAsTruth = (events?.length ?? 0) > 0;
  const countMap = useEventsAsTruth ? eventCountMap : seriesCountMap;

  const maxValue = useMemo(() => {
    let m = 0; countMap.forEach(v => { if (v > m) m = v; });
    return Math.max(1, m);
  }, [countMap]);

  const paletteArr: string[] = useMemo(() => {
    if (Array.isArray(palette) && palette.length >= 2) return palette;
    const key = palette === 'auto' ? 'blue' : (palette as 'blue'|'green'|'purple');
    return PALETTES[key] || PALETTES.blue;
  }, [palette]);

  const colorFor = (v: number) => {
    const idx = Math.min(paletteArr.length - 1, Math.floor((v / maxValue) * (paletteArr.length - 1)));
    return paletteArr[idx];
  };

  // выбор: день / диапазон
  const [selectedDayStart, setSelectedDayStart] = useState<Date | null>(null);
  const [selStart, setSelStart] = useState<Date | null>(null);
  const [selEnd, setSelEnd]     = useState<Date | null>(null);

  const computeSumBetweenDays = (a: Date, b: Date) => {
    const A = startOfDay(a), B = endOfDay(b);
    let sum = 0;
    for (let d = new Date(A); d.getTime() <= B.getTime(); d = addDays(d, 1)) {
      sum += countMap.get(ymd(d)) || 0; // считаем из выбранной карты
    }
    return sum;
  };

  // события под выбор
  const [asc, setAsc] = useState(false);
  const filteredEvents = useMemo(() => {
    const src = events || [];
    let from: Date | null = null;
    let to  : Date | null = null;

    if (selStart && selEnd) {
      const a = selStart.getTime() <= selEnd.getTime() ? selStart : selEnd;
      const b = selStart.getTime() <= selEnd.getTime() ? selEnd   : selStart;
      from = startOfDay(a);
      to   = endOfDay(b);
    } else if (selectedDayStart) {
      from = startOfDay(selectedDayStart);
      to   = endOfDay(selectedDayStart);
    } else {
      return [];
    }

    return src
      .map(e => ({ ...e, _dt: toLocalDate(e.ts) }))
      .filter(e => e._dt >= (from!) && e._dt <= (to!))
      .sort((a, b) => asc ? a._dt.getTime() - b._dt.getTime() : b._dt.getTime() - a._dt.getTime()) as
      (EventItem & { _dt: Date })[];
  }, [events, selStart, selEnd, selectedDayStart, asc]);

  // размеры
  const gap = 8;
  const headerH = 44;
  const weekdayH = 20;
  const contentW = Math.max(0, gridW);
  const cellSize = contentW > 0 ? Math.floor((contentW - gap * 6) / 7) : 0;

  // модалка выбора месяца/года
  const [pickVisible, setPickVisible] = useState(false);
  const [pickYear, setPickYear] = useState(month.getFullYear());
  const [pickMonth, setPickMonth] = useState(month.getMonth());
  useEffect(() => {
    if (pickVisible) { setPickYear(month.getFullYear()); setPickMonth(month.getMonth()); }
  }, [pickVisible, month]);

  const applyPick = () => {
    onChangeMonth?.(new Date(pickYear, pickMonth, 1));
    setPickVisible(false);
  };

  const Header = (
    <View style={[styles.header, { height: headerH }]}>
      <Pressable onPress={() => onChangeMonth?.(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.iconBtn}>
        <Ionicons name="chevron-back" size={18} color={colors.text} />
      </Pressable>

      <Pressable style={styles.monthBtn} onPress={() => setPickVisible(true)}>
        <Text style={[styles.monthTitle, { color: colors.text }]} numberOfLines={1}>
          {monthNameRuFull(month.getMonth())} {month.getFullYear()}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.text} />
      </Pressable>

      <Pressable onPress={() => onChangeMonth?.(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.iconBtn}>
        <Ionicons name="chevron-forward" size={18} color={colors.text} />
      </Pressable>
    </View>
  );

  const wds = startOfWeek === 1 ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] : ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

  const WeekdayRow = (
    <View style={[styles.weekdays, { height: weekdayH }]}>
      {wds.map((w, i) => (
        <View key={i} style={{ width: cellSize, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: colors.secondaryText }}>{w}</Text>
        </View>
      ))}
    </View>
  );

  const Legend = (
    <View style={styles.legendRow}>
      <Text style={{ color: colors.secondaryText, fontSize: 12, marginRight: 8 }}>Меньше</Text>
      {paletteArr.map((c, i) => (
        <View key={i} style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: c, marginHorizontal: 2 }} />
      ))}
      <Text style={{ color: colors.secondaryText, fontSize: 12, marginLeft: 8 }}>Больше</Text>
    </View>
  );

  const scansCountForInfo = filteredEvents.length;

  const InfoBar = (
    <View style={styles.infoBar}>
      {selStart && !selEnd ? (
        <Text style={{ color: colors.text }}>
          Начало диапазона: <Text style={{ fontWeight: '800' }}>{ymd(selStart)} 00:00</Text>
        </Text>
      ) : selStart && selEnd ? (
        <Text style={{ color: colors.text }}>
          Диапазон: {ymd(startOfDay(selStart))} 00:00 — {ymd(endOfDay(selEnd))} 23:59 • Сканов: <Text style={{ fontWeight: '800' }}>{scansCountForInfo}</Text>
        </Text>
      ) : selectedDayStart ? (
        <Text style={{ color: colors.text }}>
          {ymd(selectedDayStart)} 00:00 — 23:59 • Сканов: <Text style={{ fontWeight: '800' }}>{scansCountForInfo}</Text>
        </Text>
      ) : (
        <Text style={{ color: colors.secondaryText }}>
          Нажмите день — детали за сутки. Зажмите — чтобы выбрать период (полные дни).
        </Text>
      )}
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: '#EEF2FF' }]}>
      {Header}
      {WeekdayRow}

      <View style={styles.gridContainer} onLayout={onGridLayout}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {days.map((d, idx) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === month.getMonth();

            // значение дня — из выбранной карты (если есть события, то только по событиям)
            const v = countMap.get(key) || 0;
            const intensity = v / (maxValue || 1);

            const isSelStart = selStart && sameDay(d, selStart);
            const isSelEnd   = selEnd && sameDay(d, selEnd);
            const inRange    = selStart && selEnd && isBetweenInc(d, selStart, selEnd);
            const isWeekend  = [0, 6].includes(d.getDay());

            // ВАЖНО: если v === 0 — не красим фон
            const bg = !inMonth ? colors.background : (v > 0 ? colorFor(v) : colors.cardBackground);

            const isSelectedDay = selectedDayStart && sameDay(d, selectedDayStart);
            const lowValueOutline = v > 0 && intensity <= 0.25;
            const dayNumColor =
              v > 0 && intensity >= 0.65 ? '#FFFFFF' : (highlightWeekends && isWeekend ? '#DC2626' : '#111827');
            const isLastCol = (idx % 7) === 6;

            let borderWidth = lowValueOutline ? 1.5 : 1;
            let borderColor = lowValueOutline ? '#4B5563' : 'rgba(17,24,39,0.08)';
            if (isSelectedDay || isSelStart || isSelEnd) { borderWidth = 2; borderColor = '#FB923C'; }

            return (
              <Pressable
                key={key}
                style={[
                  styles.cell,
                  {
                    width: cellSize,
                    height: cellSize,
                    marginRight: isLastCol ? 0 : 8,
                    marginBottom: 8,
                    backgroundColor: bg,
                    borderWidth,
                    borderColor,
                    opacity: inMonth ? 1 : 0.35,
                  },
                ]}
                onPress={() => {
                  const ds = startOfDay(d);
                  const de = endOfDay(d);
                  setSelectedDayStart(ds);
                  setSelStart(null);
                  setSelEnd(null);
                  onDayPress?.({ date: ds, value: v, from: ds, to: de });
                }}
                onLongPress={() => {
                  const ds = startOfDay(d);
                  const de = endOfDay(d);
                  if (!selStart) {
                    setSelectedDayStart(null);
                    setSelStart(ds);
                    setSelEnd(null);
                  } else {
                    setSelEnd(de);
                    const sum = computeSumBetweenDays(selStart, de);
                    onRangeChange?.({
                      from: selStart <= ds ? selStart : ds,
                      to:   selStart <= ds ? de       : endOfDay(selStart),
                      sum,
                    });
                  }
                }}
              >
                <Text numberOfLines={1} style={[styles.dayNum, { color: dayNumColor }]}>{d.getDate()}</Text>
                {inRange ? (
                  <View pointerEvents="none" style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: '#F59E0B22', borderRadius: 10,
                  }}/>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {Legend}
      {InfoBar}

      {(selectedDayStart || (selStart && selEnd)) && (
        <>
          <View style={styles.eventsHeader}>
            <Text style={[styles.eventsTitle, { color: colors.text }]}>События</Text>
            <View style={{ flexDirection: 'row' }}>
              <Pressable style={styles.eventsIconBtn} onPress={() => setAsc(a => !a)}>
                <Ionicons name="swap-vertical" size={16} color={colors.text} />
              </Pressable>
              <View style={{ width: 8 }} />
              <Pressable
                style={styles.eventsIconBtn}
                onPress={() => { setSelectedDayStart(null); setSelStart(null); setSelEnd(null); }}
              >
                <Ionicons name="close" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <View style={styles.eventsListBox}>
            {filteredEvents.length === 0 ? (
              <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ color: colors.secondaryText, fontSize: 12 }}>Нет событий для выбранного периода</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 240 }}>
                {filteredEvents.map((ev, idx) => {
                  const dt = toLocalDate(ev.ts);
                  return (
                    <View key={`${dt.getTime()}-${idx}`} style={styles.eventRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>
                          {ev.title || 'Сканирование'}
                        </Text>
                        <Text style={{ color: colors.secondaryText, fontSize: 12 }}>
                          {dt.toLocaleString()} {ev.city ? `• ${ev.city}` : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </>
      )}

      {/* Пикер месяца/года */}
      <Modal visible={pickVisible} transparent animationType="fade" onRequestClose={() => setPickVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setPickVisible(false)}>
          <View style={[styles.pickerCard, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Выбор месяца</Text>

            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                {Array.from({ length: 12 }, (_, m) => m).map(m => {
                  const active = pickMonth === m;
                  return (
                    <Pressable key={m} onPress={() => setPickMonth(m)} style={[styles.monthCell, active && styles.monthCellActive]}>
                      <Text style={[styles.monthCellText, { color: active ? '#0B1220' : colors.text }]}>
                        {monthNameRuFull(m).slice(0, 3)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                <Pressable style={styles.yearBtn} onPress={() => setPickYear(y => y - 1)}>
                  <Ionicons name="remove" size={16} color={colors.text} />
                </Pressable>
                <Text style={[styles.yearText, { color: colors.text }]}>{pickYear}</Text>
                <Pressable style={styles.yearBtn} onPress={() => setPickYear(y => y + 1)}>
                  <Ionicons name="add" size={16} color={colors.text} />
                </Pressable>
              </View>

              <View style={{ alignItems: 'flex-end', marginTop: 14 }}>
                <Pressable onPress={applyPick} style={styles.applyBtn}>
                  <Ionicons name="checkmark" size={16} color="#0B1220" />
                  <Text style={styles.applyBtnText}>Применить</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  iconBtn: {
    height: 36, width: 36, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
  },
  monthBtn: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    height: 36, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF',
    maxWidth: '72%', gap: 6,
  },
  monthTitle: { fontWeight: '800' },
  weekdays: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  gridContainer: { width: '100%', marginTop: 2, marginBottom: 8 },
  cell: { borderRadius: 10, alignItems: 'flex-start', justifyContent: 'flex-start', padding: 6 },
  dayNum: { fontSize: 11, fontWeight: '700' },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, marginBottom: 6 },
  infoBar: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#EFF2F6', borderBottomWidth: 1, borderBottomColor: '#EFF2F6' },
  eventsHeader: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventsTitle: { fontSize: 16, fontWeight: '800' },
  eventsIconBtn: {
    height: 32, width: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF',
  },
  eventsListBox: { marginTop: 6 },
  eventRow: { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  eventTitle: { fontWeight: '700' },
  overlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  pickerCard: {
    width: '96%', maxWidth: 520, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E5E7EB',
    ...Platform.select({
      web: { boxShadow: '0px 10px 24px rgba(0,0,0,0.18)' },
      ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 10 },
    }),
  },
  pickerTitle: { fontWeight: '800', fontSize: 16 },
  monthCell: {
    width: '31.5%', marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    paddingVertical: 10, alignItems: 'center', backgroundColor: '#FFFFFF',
  },
  monthCellActive: { backgroundColor: '#FCD34D', borderColor: '#FCD34D' },
  monthCellText: { fontWeight: '700' },
  yearBtn: {
    height: 36, width: 36, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
  },
  yearText: { fontWeight: '800', fontSize: 16, marginHorizontal: 10 },
  applyBtn: {
    height: 38, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB', flexDirection: 'row',
  },
  applyBtnText: { fontWeight: '800', color: '#0B1220', marginLeft: 6 },
});
