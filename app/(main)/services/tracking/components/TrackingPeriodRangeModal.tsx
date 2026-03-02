import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { buildMonthGrid, endOfDay, formatDateOnly, startOfDay } from '../helpers';
import { trackingStyles as styles } from '../styles';
import TrackingModalShell from './TrackingModalShell';

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

type Props = {
  visible: boolean;
  compact?: boolean;
  initialFrom?: string | null;
  initialTo?: string | null;
  onClose: () => void;
  onApply: (from: Date, to: Date) => void;
  onReset: () => void;
};

const isSameDay = (a?: Date | null, b?: Date | null) => {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

export default function TrackingPeriodRangeModal({
  visible,
  compact = false,
  initialFrom,
  initialTo,
  onClose,
  onApply,
  onReset,
}: Props) {
  const [month, setMonth] = React.useState(new Date());
  const [rangeStart, setRangeStart] = React.useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = React.useState<Date | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    const from = initialFrom ? new Date(initialFrom) : null;
    const to = initialTo ? new Date(initialTo) : null;
    const start = from && !Number.isNaN(from.getTime()) ? startOfDay(from) : null;
    const end = to && !Number.isNaN(to.getTime()) ? startOfDay(to) : null;
    setRangeStart(start);
    setRangeEnd(end);
    setMonth(start || end || new Date());
  }, [initialFrom, initialTo, visible]);

  const calendarGrid = React.useMemo(() => buildMonthGrid(month, 1), [month]);
  const weeks = React.useMemo(
    () => Array.from({ length: 6 }, (_, i) => calendarGrid.slice(i * 7, i * 7 + 7)),
    [calendarGrid]
  );
  const monthLabel = React.useMemo(
    () => month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    [month]
  );

  const selectDay = (day: Date) => {
    const selected = startOfDay(day);
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(selected);
      setRangeEnd(null);
      return;
    }
    if (selected.getTime() < rangeStart.getTime()) {
      setRangeEnd(rangeStart);
      setRangeStart(selected);
      return;
    }
    setRangeEnd(selected);
  };

  const applyRange = () => {
    if (!rangeStart || !rangeEnd) return;
    onApply(startOfDay(rangeStart), endOfDay(rangeEnd));
    onClose();
  };

  const footer = (
    <>
      <Pressable
        onPress={onReset}
        style={(state: any) => [
          styles.secondaryBtn,
          state?.hovered && styles.secondaryBtnHover,
          state?.pressed && styles.secondaryBtnPressed,
          { flex: 1 },
        ]}
      >
        <Text style={styles.secondaryBtnText}>Сбросить</Text>
      </Pressable>
      <Pressable
        onPress={onClose}
        style={(state: any) => [
          styles.secondaryBtn,
          state?.hovered && styles.secondaryBtnHover,
          state?.pressed && styles.secondaryBtnPressed,
          { flex: 1 },
        ]}
      >
        <Text style={styles.secondaryBtnText}>Отмена</Text>
      </Pressable>
      <Pressable
        disabled={!rangeStart || !rangeEnd}
        onPress={applyRange}
        style={(state: any) => [
          styles.primaryBtn,
          state?.hovered && styles.primaryBtnHover,
          state?.pressed && styles.primaryBtnPressed,
          (!rangeStart || !rangeEnd) && { opacity: 0.55 },
          { flex: 1 },
        ]}
      >
        <Text style={styles.primaryBtnText}>Применить</Text>
      </Pressable>
    </>
  );

  return (
    <TrackingModalShell
      visible={visible}
      title="Период"
      onClose={onClose}
      footer={footer}
      compact={compact}
      bodyScroll
    >
      <View style={styles.calendarContainer}>
        <View style={styles.calendarNavRow}>
          <Pressable
            style={({ pressed }) => [styles.calendarNavBtn, pressed && { opacity: 0.9 }]}
            onPress={() => setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
          >
            <Ionicons name="chevron-back" size={16} color="#334155" />
          </Pressable>
          <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
          <Pressable
            style={({ pressed }) => [styles.calendarNavBtn, pressed && { opacity: 0.9 }]}
            onPress={() => setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
          >
            <Ionicons name="chevron-forward" size={16} color="#334155" />
          </Pressable>
        </View>

        <View style={styles.weekDaysRow}>
          {WEEK_DAYS.map((day) => (
            <Text key={day} style={styles.weekDayText}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.monthGrid}>
          {weeks.map((week, weekIdx) => (
            <View key={`w-${weekIdx}`} style={styles.monthWeekRow}>
              {week.map((day) => {
                const outside = day.getMonth() !== month.getMonth();
                const selected =
                  isSameDay(day, rangeStart) ||
                  isSameDay(day, rangeEnd) ||
                  Boolean(
                    rangeStart &&
                      rangeEnd &&
                      day.getTime() > rangeStart.getTime() &&
                      day.getTime() < rangeEnd.getTime()
                  );

                const anchor = isSameDay(day, rangeStart) || isSameDay(day, rangeEnd);

                return (
                  <Pressable
                    key={`${day.toISOString()}-${weekIdx}`}
                    onPress={() => selectDay(day)}
                    style={({ pressed }) => [
                      styles.monthDayBtn,
                      outside && styles.monthDayOutside,
                      selected && styles.monthDayInRange,
                      anchor && styles.monthDaySelected,
                      pressed && { opacity: 0.94 },
                    ]}
                  >
                    <Text style={[styles.monthDayText, anchor && styles.monthDayTextSelected]}>
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.mutedText}>
        Выбранный период:{' '}
        {rangeStart ? formatDateOnly(rangeStart) : 'не задан'} - {rangeEnd ? formatDateOnly(rangeEnd) : 'не задан'}
      </Text>
    </TrackingModalShell>
  );
}
