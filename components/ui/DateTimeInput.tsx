import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import MaskInput from 'react-native-mask-input';

export type DateTimeInputProps = {
  value?: Date | string;
  onChange: (iso: string, date: Date) => void;
  placeholder?: string;
  label?: string;
  errorText?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  locale?: string;
  minDate?: Date;
  maxDate?: Date;
  disabledPast?: boolean;
  disabledFuture?: boolean;
  includeTime?: boolean;
  timePrecision?: 'minute' | 'hour';
  minuteStep?: number;
  allowClear?: boolean;
  onClear?: () => void;
  onValidate?: (date: Date) => string | void;
  quickActions?: boolean;
};

type DateTimePickerModule = typeof import('@react-native-community/datetimepicker');

const MASK_DATE = [/\d/, /\d/, '.', /\d/, /\d/, '.', /\d/, /\d/];
const MASK_DATETIME = [...MASK_DATE, ' ', /\d/, /\d/, ':', /\d/, /\d/];

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function toDate(v?: Date | string): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return isValidDate(v) ? v : undefined;
  const parsed = new Date(v);
  return isValidDate(parsed) ? parsed : undefined;
}

function safeDate(v?: Date | string): Date {
  return toDate(v) ?? new Date();
}

function pad2(v: number): string {
  return String(v).padStart(2, '0');
}

function roundToHour(d: Date): Date {
  const next = new Date(d);
  next.setMinutes(0, 0, 0);
  return next;
}

function normalizeMinuteStep(step: number): number {
  const asInt = Number.isFinite(step) ? Math.floor(step) : 5;
  return Math.min(30, Math.max(1, asInt || 5));
}

function snapMinute(value: number, step: number): number {
  const safeStep = normalizeMinuteStep(step);
  const clamped = Math.max(0, Math.min(59, value));
  const snapped = Math.round(clamped / safeStep) * safeStep;
  return snapped >= 60 ? 60 - safeStep : snapped;
}

function snapMinutes(d: Date, step: number): Date {
  const next = new Date(d);
  next.setMinutes(snapMinute(next.getMinutes(), step), 0, 0);
  return next;
}

function applyPrecision(d: Date, precision: 'minute' | 'hour', minuteStep: number): Date {
  if (precision === 'hour') return roundToHour(d);
  return snapMinutes(d, minuteStep);
}

function formatDisplay(date: Date, includeTime: boolean, precision: 'minute' | 'hour'): string {
  const dd = pad2(date.getDate());
  const mm = pad2(date.getMonth() + 1);
  const yy = pad2(date.getFullYear() % 100);
  if (!includeTime) return `${dd}.${mm}.${yy}`;
  const hh = pad2(date.getHours());
  const mins = precision === 'hour' ? '00' : pad2(date.getMinutes());
  return `${dd}.${mm}.${yy} ${hh}:${mins}`;
}

function clampTwoDigitSegment(segment: string, min: number, max: number): string {
  if (!/^\d{2}$/.test(segment)) return segment;
  const parsed = Number(segment);
  if (!Number.isFinite(parsed)) return segment;
  const bounded = Math.min(max, Math.max(min, parsed));
  return pad2(bounded);
}

function sanitizeMaskedInput(masked: string, includeTime: boolean): string {
  let next = masked;

  if (next.length >= 2) {
    const dd = next.slice(0, 2);
    if (/^\d{2}$/.test(dd)) {
      next = `${clampTwoDigitSegment(dd, 1, 31)}${next.slice(2)}`;
    }
  }

  if (next.length >= 5) {
    const mm = next.slice(3, 5);
    if (/^\d{2}$/.test(mm)) {
      next = `${next.slice(0, 3)}${clampTwoDigitSegment(mm, 1, 12)}${next.slice(5)}`;
    }
  }

  if (next.length >= 5) {
    const dd = next.slice(0, 2);
    const mm = next.slice(3, 5);
    if (/^\d{2}$/.test(dd) && /^\d{2}$/.test(mm)) {
      const yearGuess = next.length >= 8 && /^\d{2}$/.test(next.slice(6, 8))
        ? 2000 + Number(next.slice(6, 8))
        : new Date().getFullYear();
      const monthNum = Number(mm);
      const maxDay = new Date(yearGuess, monthNum, 0).getDate();
      const safeDay = clampTwoDigitSegment(dd, 1, maxDay);
      if (safeDay !== dd) {
        next = `${safeDay}${next.slice(2)}`;
      }
    }
  }

  if (includeTime && next.length >= 11) {
    const hh = next.slice(9, 11);
    if (/^\d{2}$/.test(hh)) {
      next = `${next.slice(0, 9)}${clampTwoDigitSegment(hh, 0, 23)}${next.slice(11)}`;
    }
  }

  if (includeTime && next.length >= 14) {
    const mins = next.slice(12, 14);
    if (/^\d{2}$/.test(mins)) {
      next = `${next.slice(0, 12)}${clampTwoDigitSegment(mins, 0, 59)}${next.slice(14)}`;
    }
  }

  return next;
}

function parseStrictMasked(text: string, includeTime: boolean, precision: 'minute' | 'hour'): Date | null {
  const trimmed = text.trim();
  const match = includeTime
    ? trimmed.match(/^(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/)
    : trimmed.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = 2000 + Number(match[3]);
  const hour = includeTime ? Number(match[4]) : 0;
  const minute = includeTime ? Number(match[5]) : 0;

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute
  ) {
    return null;
  }
  if (precision === 'hour') parsed.setMinutes(0, 0, 0);
  return parsed;
}

function resolveBounds(
  minDate: Date | undefined,
  maxDate: Date | undefined,
  disabledPast: boolean,
  disabledFuture: boolean
): { min?: Date; max?: Date } {
  const now = new Date();
  const min = disabledPast ? (minDate && minDate > now ? minDate : now) : minDate;
  const max = disabledFuture ? (maxDate && maxDate < now ? maxDate : now) : maxDate;
  return { min, max };
}

function buildMonthGrid(month: Date): Date[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstWeekday);
  return Array.from({ length: 42 }, (_, idx) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + idx);
    return d;
  });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayAllowed(day: Date, min?: Date, max?: Date): boolean {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  if (min && dayEnd < min) return false;
  if (max && dayStart > max) return false;
  return true;
}

function monthTitle(month: Date): string {
  return month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

export default function DateTimeInput({
  value,
  onChange,
  placeholder,
  label,
  errorText,
  disabled = false,
  style,
  locale = 'ru-RU',
  minDate,
  maxDate,
  disabledPast = false,
  disabledFuture = false,
  includeTime = true,
  timePrecision = 'minute',
  minuteStep = 5,
  allowClear = false,
  onClear,
  onValidate,
  quickActions = true,
}: DateTimeInputProps) {
  const safeMinuteStep = normalizeMinuteStep(minuteStep);
  const selected = useMemo(() => toDate(value), [value]);
  const [text, setText] = useState<string>(() =>
    selected ? formatDisplay(selected, includeTime, timePrecision) : ''
  );
  const [localError, setLocalError] = useState<string>('');

  const [pickerMod, setPickerMod] = useState<DateTimePickerModule | null>(null);
  const [iosVisible, setIosVisible] = useState(false);
  const [temp, setTemp] = useState<Date>(() => applyPrecision(safeDate(value), timePrecision, safeMinuteStep));
  const androidOpenRef = useRef(false);

  const [webVisible, setWebVisible] = useState(false);
  const [webMonth, setWebMonth] = useState<Date>(new Date());
  const [webDay, setWebDay] = useState<Date>(() => new Date());
  const [webHour, setWebHour] = useState<number>(new Date().getHours());
  const [webMinute, setWebMinute] = useState<number>(snapMinute(new Date().getMinutes(), safeMinuteStep));

  const bounds = useMemo(
    () => resolveBounds(minDate, maxDate, disabledPast, disabledFuture),
    [minDate, maxDate, disabledPast, disabledFuture]
  );

  useEffect(() => {
    if (selected) {
      const fixed = applyPrecision(selected, timePrecision, safeMinuteStep);
      setText(formatDisplay(fixed, includeTime, timePrecision));
      setTemp(fixed);
    } else {
      setText('');
    }
    setLocalError('');
  }, [selected, includeTime, timePrecision, safeMinuteStep]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !webVisible) return;
    const onKeyDown = (event: any) => {
      if (event?.key === 'Escape') setWebVisible(false);
    };
    const win = globalThis as any;
    win?.addEventListener?.('keydown', onKeyDown);
    return () => win?.removeEventListener?.('keydown', onKeyDown);
  }, [webVisible]);

  const validateDate = useCallback(
    (raw: Date): string | null => {
      const date = applyPrecision(raw, timePrecision, safeMinuteStep);
      const currentBounds = resolveBounds(minDate, maxDate, disabledPast, disabledFuture);
      if (currentBounds.min && date < currentBounds.min) {
        if (disabledPast) return 'Дедлайн не может быть в прошлом.';
        return 'Дата раньше допустимой.';
      }
      if (currentBounds.max && date > currentBounds.max) return 'Дата позже допустимой.';
      if (onValidate) {
        const result = onValidate(date);
        if (result) return result;
      }
      return null;
    },
    [disabledFuture, disabledPast, maxDate, minDate, onValidate, safeMinuteStep, timePrecision]
  );

  const emitDate = useCallback(
    (raw: Date): boolean => {
      const fixed = applyPrecision(raw, timePrecision, safeMinuteStep);
      const validationMessage = validateDate(fixed);
      if (validationMessage) {
        setLocalError(validationMessage);
        Alert.alert('Проверьте дату', validationMessage);
        return false;
      }
      setLocalError('');
      setText(formatDisplay(fixed, includeTime, timePrecision));
      onChange(fixed.toISOString(), fixed);
      return true;
    },
    [includeTime, onChange, safeMinuteStep, timePrecision, validateDate]
  );

  const ensureModule = useCallback(async () => {
    if (pickerMod) return pickerMod;
    try {
      const module = await import('@react-native-community/datetimepicker');
      setPickerMod(module);
      return module;
    } catch {
      Alert.alert('Нужен модуль даты', 'Установите @react-native-community/datetimepicker и перезапустите приложение.');
      return null;
    }
  }, [pickerMod]);

  const openWebModal = useCallback(() => {
    const current = applyPrecision(safeDate(value), timePrecision, safeMinuteStep);
    setWebDay(current);
    setWebMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    setWebHour(current.getHours());
    setWebMinute(snapMinute(current.getMinutes(), safeMinuteStep));
    setWebVisible(true);
  }, [safeMinuteStep, timePrecision, value]);

  const openPicker = useCallback(async () => {
    if (disabled) return;
    if (Platform.OS === 'web') {
      openWebModal();
      return;
    }

    const module = await ensureModule();
    if (!module) return;

    const current = applyPrecision(safeDate(value), timePrecision, safeMinuteStep);
    const currentBounds = resolveBounds(minDate, maxDate, disabledPast, disabledFuture);

    if (Platform.OS === 'android' && (module as any).DateTimePickerAndroid) {
      if (androidOpenRef.current) return;
      androidOpenRef.current = true;
      const { DateTimePickerAndroid } = module as any;

      DateTimePickerAndroid.open({
        mode: 'date',
        value: current,
        is24Hour: true,
        minimumDate: currentBounds.min,
        maximumDate: currentBounds.max,
        onChange: (event: any, pickedDate?: Date) => {
          if (event?.type !== 'set' || !pickedDate) {
            androidOpenRef.current = false;
            return;
          }

          const base = new Date(pickedDate);
          if (!includeTime) {
            const now = applyPrecision(new Date(), timePrecision, safeMinuteStep);
            base.setHours(now.getHours(), now.getMinutes(), 0, 0);
            androidOpenRef.current = false;
            emitDate(base);
            return;
          }

          DateTimePickerAndroid.open({
            mode: 'time',
            value: current,
            is24Hour: true,
            onChange: (eventTime: any, pickedTime?: Date) => {
              androidOpenRef.current = false;
              if (eventTime?.type !== 'set' || !pickedTime) return;
              const finalDate = new Date(base);
              finalDate.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
              emitDate(finalDate);
            },
          });
        },
      });
      return;
    }

    setTemp(current);
    setIosVisible(true);
  }, [
    disabled,
    openWebModal,
    ensureModule,
    value,
    timePrecision,
    safeMinuteStep,
    minDate,
    maxDate,
    disabledPast,
    disabledFuture,
    includeTime,
    emitDate,
  ]);

  const commitText = useCallback(() => {
    if (!text.trim()) {
      setLocalError('');
      return;
    }

    const parsed = parseStrictMasked(text, includeTime, timePrecision);
    if (!parsed) {
      const fmt = includeTime ? 'ДД.ММ.ГГ ЧЧ:ММ' : 'ДД.ММ.ГГ';
      const message = `Введите дату в формате ${fmt}.`;
      setLocalError(message);
      Alert.alert('Неверный формат', message);
      return;
    }

    if (!emitDate(parsed)) return;
  }, [emitDate, includeTime, text, timePrecision]);

  const onWebApply = useCallback(() => {
    const base = new Date(webDay.getFullYear(), webDay.getMonth(), webDay.getDate(), 0, 0, 0, 0);
    if (includeTime) {
      base.setHours(webHour, timePrecision === 'hour' ? 0 : webMinute, 0, 0);
    } else {
      const now = new Date();
      base.setHours(now.getHours(), now.getMinutes(), 0, 0);
    }
    if (emitDate(base)) setWebVisible(false);
  }, [emitDate, includeTime, timePrecision, webDay, webHour, webMinute]);

  const iosConfirm = () => {
    const base = new Date(temp);
    if (!includeTime) {
      const now = new Date();
      base.setHours(now.getHours(), now.getMinutes(), 0, 0);
    }
    if (emitDate(base)) setIosVisible(false);
  };

  const minuteOptions = useMemo(() => {
    if (timePrecision === 'hour') return [0];
    const result: number[] = [];
    for (let minute = 0; minute < 60; minute += safeMinuteStep) result.push(minute);
    return result.length ? result : [0];
  }, [safeMinuteStep, timePrecision]);

  const monthGrid = useMemo(() => buildMonthGrid(webMonth), [webMonth]);
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, idx) => monthGrid.slice(idx * 7, idx * 7 + 7)), [monthGrid]);
  const nowSnapshot = useMemo(() => applyPrecision(new Date(), timePrecision, safeMinuteStep), [safeMinuteStep, timePrecision, webVisible]);
  const nowLabel = useMemo(() => formatDisplay(nowSnapshot, includeTime, timePrecision), [includeTime, nowSnapshot, timePrecision]);

  const quicks = useMemo(() => {
    if (!quickActions || !includeTime) return [] as { label: string; getDate: () => Date }[];
    return [
      { label: 'Через 1 час', getDate: () => new Date(Date.now() + 60 * 60 * 1000) },
      { label: 'Сегодня 09:00', getDate: () => new Date(new Date().setHours(9, 0, 0, 0)) },
      { label: 'Сегодня 18:00', getDate: () => new Date(new Date().setHours(18, 0, 0, 0)) },
      {
        label: 'Завтра 09:00',
        getDate: () => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          d.setHours(9, 0, 0, 0);
          return d;
        },
      },
    ];
  }, [includeTime, quickActions]);

  const useQuick = (getDate: () => Date) => {
    setTemp(applyPrecision(getDate(), timePrecision, safeMinuteStep));
  };

  const clearSelected = () => {
    if (!allowClear || disabled) return;
    setLocalError('');
    onClear?.();
  };

  const mask = includeTime ? MASK_DATETIME : MASK_DATE;
  const effectivePlaceholder = placeholder ?? (includeTime ? '23.08.25 00:00' : '23.08.25');
  const renderedError = localError || errorText;
  const jumpToToday = () => {
    const now = applyPrecision(new Date(), timePrecision, safeMinuteStep);
    setWebDay(now);
    setWebMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    if (includeTime) {
      setWebHour(now.getHours());
      setWebMinute(timePrecision === 'hour' ? 0 : snapMinute(now.getMinutes(), safeMinuteStep));
    }
  };

  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.inputWrap}>
        <MaskInput
          value={text}
          onChangeText={(masked) => {
            setText(sanitizeMaskedInput(masked, includeTime));
            if (localError) setLocalError('');
          }}
          onBlur={commitText}
          onSubmitEditing={commitText}
          editable={!disabled}
          mask={mask}
          placeholder={effectivePlaceholder}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
          inputMode="numeric"
          returnKeyType="done"
          style={styles.input}
          placeholderTextColor="#9CA3AF"
          onKeyPress={(event) => {
            if (Platform.OS === 'web' && event.nativeEvent.key === 'Enter') commitText();
          }}
        />

        <Pressable
          onPress={openPicker}
          disabled={disabled}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
          accessibilityRole="button"
          accessibilityLabel="Открыть календарь"
          hitSlop={8}
        >
          <Ionicons name="calendar" size={16} color="#111827" />
        </Pressable>

        {allowClear && selected && !disabled ? (
          <Pressable onPress={clearSelected} hitSlop={10} style={styles.clearBtn} accessibilityLabel="Очистить дату">
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </Pressable>
        ) : null}
      </View>

      {renderedError ? <Text style={styles.errorText}>{renderedError}</Text> : null}

      {iosVisible ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setIosVisible(false)}>
          <Pressable style={styles.backdrop} onPress={() => setIosVisible(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{includeTime ? 'Выберите дату и время' : 'Выберите дату'}</Text>
            </View>

            {quickActions ? (
              <View style={styles.quickRow}>
                {quicks.map((quick) => (
                  <Pressable key={quick.label} onPress={() => useQuick(quick.getDate)} style={({ pressed }) => [styles.quickChip, pressed && { opacity: 0.9 }]}>
                    <Text style={styles.quickChipText}>{quick.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {pickerMod
              ? React.createElement((pickerMod as any).default ?? (pickerMod as any), {
                  value: isValidDate(temp) ? temp : applyPrecision(new Date(), timePrecision, safeMinuteStep),
                  mode: includeTime ? 'datetime' : 'date',
                  display: 'spinner',
                  onChange: (_: any, next?: Date) => next && setTemp(next),
                  minimumDate: bounds.min,
                  maximumDate: bounds.max,
                  ...(Platform.OS === 'ios' ? { locale } : {}),
                  ...(includeTime && timePrecision === 'minute' && Platform.OS === 'ios'
                    ? { minuteInterval: Math.min(Math.max(1, safeMinuteStep), 30) }
                    : {}),
                  style: { backgroundColor: '#fff' },
                })
              : null}

            <View style={styles.modalButtonsRow}>
              <Pressable onPress={() => setIosVisible(false)} style={[styles.modalBtn, styles.modalBtnGhost]}>
                <Text style={[styles.modalBtnText, styles.modalBtnGhostText]}>Отмена</Text>
              </Pressable>
              <Pressable onPress={iosConfirm} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>Готово</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}

      {Platform.OS === 'web' && webVisible ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setWebVisible(false)}>
          <View style={styles.backdropDark}>
            <Pressable style={styles.backdropHitArea} onPress={() => setWebVisible(false)} />
            <View style={styles.webModalCard}>
              <View style={styles.webHeader}>
                <Text style={styles.webTitle}>{includeTime ? 'Выберите дедлайн' : 'Выберите дату'}</Text>
                <View style={styles.todayRow}>
                  <Text style={styles.todayText}>Сегодня: {nowLabel}</Text>
                  <Pressable onPress={jumpToToday} style={({ pressed }) => [styles.todayBtn, pressed && { opacity: 0.85 }]}>
                    <Text style={styles.todayBtnText}>Сегодня</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.monthNav}>
                <Pressable onPress={() => setWebMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} style={styles.navBtn}>
                  <Text style={styles.navArrow}>‹</Text>
                </Pressable>
                <Text style={styles.monthLabel}>{monthTitle(webMonth)}</Text>
                <Pressable onPress={() => setWebMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} style={styles.navBtn}>
                  <Text style={styles.navArrow}>›</Text>
                </Pressable>
              </View>

              <View style={styles.weekdaysRow}>
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((weekday) => (
                  <Text key={weekday} style={styles.weekdayLabel}>
                    {weekday}
                  </Text>
                ))}
              </View>

              <View style={styles.weeksWrap}>
                {weeks.map((week, weekIndex) => (
                  <View key={`week-${weekIndex}`} style={styles.weekRow}>
                    {week.map((day) => {
                      const inMonth = day.getMonth() === webMonth.getMonth();
                      const selectedDay = sameDay(day, webDay);
                      const isToday = sameDay(day, nowSnapshot);
                      const disabledDay = !dayAllowed(day, bounds.min, bounds.max);
                      return (
                        <Pressable
                          key={day.toISOString()}
                          disabled={disabledDay}
                          onPress={() => setWebDay(day)}
                          style={({ pressed }) => [
                            styles.dayCell,
                            !inMonth && styles.dayCellMuted,
                            isToday && styles.dayCellToday,
                            selectedDay && styles.dayCellActive,
                            disabledDay && styles.dayCellDisabled,
                            pressed && !disabledDay && styles.dayCellPressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              !inMonth && styles.dayTextMuted,
                              isToday && !selectedDay && styles.dayTextToday,
                              selectedDay && styles.dayTextActive,
                              disabledDay && styles.dayTextDisabled,
                            ]}
                          >
                            {day.getDate()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>

              {includeTime ? (
                <View style={styles.timeRow}>
                  <View style={styles.timePickerWrap}>
                    <Text style={styles.timeLabel}>Часы</Text>
                    <Picker selectedValue={webHour} onValueChange={(next) => setWebHour(Number(next))} style={styles.picker}>
                      {Array.from({ length: 24 }, (_, hour) => (
                        <Picker.Item key={`hour-${hour}`} label={pad2(hour)} value={hour} />
                      ))}
                    </Picker>
                  </View>

                  <View style={styles.timePickerWrap}>
                    <Text style={styles.timeLabel}>Минуты</Text>
                    <Picker selectedValue={webMinute} onValueChange={(next) => setWebMinute(Number(next))} style={styles.picker}>
                      {minuteOptions.map((minute) => (
                        <Picker.Item key={`minute-${minute}`} label={pad2(minute)} value={minute} />
                      ))}
                    </Picker>
                  </View>
                </View>
              ) : null}

              <View style={styles.webActions}>
                <Pressable onPress={() => setWebVisible(false)} style={[styles.modalBtn, styles.modalBtnGhost]}>
                  <Text style={[styles.modalBtnText, styles.modalBtnGhostText]}>Отмена</Text>
                </Pressable>
                <Pressable onPress={onWebApply} style={styles.modalBtn}>
                  <Text style={styles.modalBtnText}>Применить</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: '#4B5563', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  inputWrap: {
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 84,
    paddingVertical: Platform.OS === 'ios' ? 8 : 0,
  },
  input: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    paddingVertical: 10,
    borderWidth: 0,
    ...(Platform.OS === 'web'
      ? ({
          outlineWidth: 0,
          outlineColor: 'transparent',
          outlineStyle: 'none',
          borderColor: 'transparent',
          boxShadow: 'none',
        } as any)
      : null),
  },
  iconBtn: {
    position: 'absolute',
    right: 6,
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: { transform: [{ scale: 0.98 }], opacity: 0.95 },
  clearBtn: { position: 'absolute', right: 44, top: '50%', marginTop: -9 },
  errorText: { color: '#EF4444', fontSize: 12 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
  backdropDark: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  backdropHitArea: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  modalHeader: { padding: 6, paddingBottom: 10 },
  modalTitle: { color: '#111827', fontWeight: '800', fontSize: 16 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4, paddingBottom: 8 },
  quickChip: { backgroundColor: '#F3F4F6', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  quickChipText: { color: '#111827', fontWeight: '700', fontSize: 12 },
  modalButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  modalBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalBtnText: { color: '#fff', fontWeight: '800' },
  modalBtnGhost: { backgroundColor: '#F3F4F6' },
  modalBtnGhostText: { color: '#111827' },
  webModalCard: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  webHeader: { gap: 2 },
  webTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800' },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  todayText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  todayBtn: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  todayBtnText: { color: '#92400E', fontWeight: '800', fontSize: 12 },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  navArrow: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  monthLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'capitalize',
  },
  weekdaysRow: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  weekdayLabel: { width: 40, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#64748B' },
  weeksWrap: { gap: 6, alignSelf: 'center' },
  weekRow: { flexDirection: 'row', gap: 6 },
  dayCell: {
    width: 40,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  dayCellMuted: { opacity: 0.55 },
  dayCellToday: { borderColor: '#16A34A' },
  dayCellActive: { borderColor: '#2563EB', backgroundColor: '#DBEAFE' },
  dayCellDisabled: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', opacity: 0.45 },
  dayCellPressed: { transform: [{ scale: 0.98 }] },
  dayText: { color: '#0F172A', fontWeight: '700', fontSize: 12 },
  dayTextMuted: { color: '#64748B' },
  dayTextToday: { color: '#166534' },
  dayTextActive: { color: '#1D4ED8' },
  dayTextDisabled: { color: '#94A3B8' },
  timeRow: { flexDirection: 'row', gap: 12, marginTop: 2 },
  timePickerWrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  timeLabel: { color: '#64748B', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  picker: { height: 42, width: '100%' },
  webActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
});
