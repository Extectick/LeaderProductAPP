import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

const buildMonthGrid = (month: Date, startOfWeek: 0 | 1 = 1) => {
  const d0 = new Date(month.getFullYear(), month.getMonth(), 1);
  const shift = (d0.getDay() - startOfWeek + 7) % 7;
  const start = new Date(d0);
  start.setDate(d0.getDate() - shift);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

const startOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};
const endOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
};

const createStyles = (DAY_WIDTH: number, DAY_GAP: number) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    },
    card: {
      borderRadius: 16,
      padding: 14,
      width: '100%',
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
      gap: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    hint: {
      fontSize: 12,
      marginTop: -2,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 2,
    },
    navBtn: {
      height: 34,
      width: 34,
      borderRadius: 9,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
    },
    navArrow: { fontSize: 18, fontWeight: '800' },
    monthLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 15,
      fontWeight: '800',
      textTransform: 'capitalize',
    },
    weekdaysRow: {
      flexDirection: 'row',
      gap: DAY_GAP,
      marginTop: 6,
      marginBottom: 2,
      justifyContent: 'center',
    },
    weekday: {
      width: DAY_WIDTH,
      textAlign: 'center',
      fontWeight: '700',
      fontSize: 11,
    },
    weeksContainer: {
      gap: DAY_GAP,
      alignSelf: 'center',
      marginTop: 4,
    },
    weekRow: {
      flexDirection: 'row',
      gap: DAY_GAP,
      justifyContent: 'center',
    },
    day: {
      height: 42,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayMuted: { opacity: 0.5 },
    dayPressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
    dayText: { fontSize: 12, fontWeight: '800' },
    dayWeekend: { color: '#DC2626' },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      marginTop: 4,
    },
    resetBtn: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.06)',
    },
    resetText: { fontWeight: '700', color: '#0B1220' },
  });

export type RangeCalendarModalProps = {
  visible: boolean;
  onClose: () => void;
  onApply: (from: Date, to: Date) => void;
  onReset: () => void;
  initialFrom?: string | Date | null;
  initialTo?: string | Date | null;
  colors: { cardBackground: string; text: string; muted: string };
};

export default function RangeCalendarModal({
  visible,
  onClose,
  onApply,
  onReset,
  initialFrom,
  initialTo,
  colors,
}: RangeCalendarModalProps) {
  const { width } = useWindowDimensions();
  const maxWidth = width >= 900 ? 640 : width >= 520 ? 520 : width - 20;
  const DAY_GAP = 6;
  const DAY_WIDTH = Math.min(
    46,
    Math.max(34, Math.floor((maxWidth - DAY_GAP * 6 - 16) / 7))
  );
  const styles = React.useMemo(() => createStyles(DAY_WIDTH, DAY_GAP), [DAY_WIDTH, DAY_GAP]);

  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [rangeDirty, setRangeDirty] = useState(false);
  const [fade] = useState(new Animated.Value(0));

  const syncInitial = () => {
    const from = initialFrom ? new Date(initialFrom) : null;
    const to = initialTo ? new Date(initialTo) : null;
    const start = from ? startOfDay(from) : null;
    const end = to ? startOfDay(to) : null;
    setRangeStart(start);
    setRangeEnd(end);
    setCalendarMonth(start || end || new Date());
    setRangeDirty(false);
  };

  useEffect(() => {
    if (visible) {
      syncInitial();
      fade.setValue(0);
      Animated.timing(fade, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const calendarMonthLabel = useMemo(
    () => calendarMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    [calendarMonth]
  );
  const calendarGrid = useMemo(() => buildMonthGrid(calendarMonth, 1), [calendarMonth]);
  const calendarWeeks = useMemo(
    () => Array.from({ length: 6 }, (_, i) => calendarGrid.slice(i * 7, i * 7 + 7)),
    [calendarGrid]
  );

  const shiftMonth = (delta: number) => {
    setCalendarMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  };

  const handleDaySelect = (date: Date) => {
    const d = startOfDay(date);
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(d);
      setRangeEnd(null);
      setRangeDirty(false);
      return;
    }
    if (d.getTime() < rangeStart.getTime()) {
      setRangeEnd(rangeStart);
      setRangeStart(d);
    } else {
      setRangeEnd(d);
    }
    setRangeDirty(true);
  };

  useEffect(() => {
    if (!rangeDirty || !rangeStart || !rangeEnd || !visible) return;
    const from = startOfDay(rangeStart);
    const to = endOfDay(rangeEnd);
    setRangeDirty(false);
    onApply(from, to);
    setTimeout(() => onClose(), 120);
  }, [rangeDirty, rangeStart, rangeEnd, visible, onApply, onClose]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.cardBackground,
              opacity: fade,
              maxWidth,
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              Выбор периода
            </Text>
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Нажмите дату начала и окончания. Период применится автоматически.
          </Text>

          <View style={styles.navRow}>
            <Pressable onPress={() => shiftMonth(-1)} style={[styles.navBtn, { borderColor: colors.muted }]}>
              <Text style={[styles.navArrow, { color: colors.text }]}>‹</Text>
            </Pressable>
            <Text style={[styles.monthLabel, { color: colors.text }]}>{calendarMonthLabel}</Text>
            <Pressable onPress={() => shiftMonth(1)} style={[styles.navBtn, { borderColor: colors.muted }]}>
              <Text style={[styles.navArrow, { color: colors.text }]}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekdaysRow}>
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => (
              <Text key={w} style={[styles.weekday, { color: colors.muted }]}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.weeksContainer}>
            {calendarWeeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((d, di) => {
                  const key = `${d.toISOString()}-${wi}-${di}`;
                  const inMonth = d.getMonth() === calendarMonth.getMonth();
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
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
                        styles.day,
                        {
                          borderColor: '#E5E7EB',
                          backgroundColor: colors.cardBackground,
                          width: DAY_WIDTH,
                        },
                        !inMonth && styles.dayMuted,
                        inRange && { backgroundColor: '#2563eb22' },
                        (isStart || isEnd) && { borderColor: '#2563eb', backgroundColor: '#2563eb33' },
                        pressed && styles.dayPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          { color: colors.text },
                          isWeekend && inMonth ? styles.dayWeekend : null,
                          !inMonth ? { color: colors.muted } : null,
                        ]}
                      >
                        {d.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => {
                onReset();
                onClose();
              }}
              style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.resetText}>Сбросить период</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// styles are generated per render via createStyles
