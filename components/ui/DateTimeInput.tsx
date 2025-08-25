// =============================
// File: V:\lp\components\ui\DateTimeInput.tsx
// =============================
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
import MaskInput from 'react-native-mask-input';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);

export type DateTimeInputProps = {
  value?: Date | string;
  onChange: (iso: string, date: Date) => void;

  placeholder?: string;          // пример: "23.08.25 00:00"
  label?: string;
  errorText?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;

  /** Локаль для iOS-пикера */
  locale?: string; // default: 'ru-RU'

  /** Ограничения диапазона выбора */
  minDate?: Date;
  maxDate?: Date;
  /** Короткие флаги для авто-ограничений */
  disabledPast?: boolean;
  disabledFuture?: boolean;

  /** Включать ли время в выборе (для модалки); сам инпут форматируем как ДД.ММ.ГГ или ДД.ММ.ГГ ЧЧ:ММ */
  includeTime?: boolean; // default: true

  /** Точность времени (час/минута) — влияет на формат отображения и округление при подтверждении */
  timePrecision?: 'minute' | 'hour'; // default: 'minute'

  /** Шаг минут (iOS minuteInterval; на Android округление при подтверждении) */
  minuteStep?: number; // default: 5

  /** Очистка */
  allowClear?: boolean;
  onClear?: () => void;

  /** Доп. валидация; верни строку — покажем Alert и не применим */
  onValidate?: (date: Date) => string | void;

  /** Быстрые пресеты (iOS модалка) */
  quickActions?: boolean;
};

// ---- helpers ----
function isValidDate(d: any): d is Date { return d instanceof Date && !isNaN(d.getTime()); }
function toDate(v?: Date | string): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return isValidDate(v) ? v : undefined;
  const d = new Date(v);
  return isValidDate(d) ? d : undefined;
}
function safeDate(v?: Date | string): Date { return toDate(v) ?? new Date(); }
function roundToHour(d: Date): Date { const n = new Date(d); n.setMinutes(0,0,0); return n; }
function snapMinutes(d: Date, step: number): Date {
  const n = new Date(d);
  const m = n.getMinutes();
  const snapped = Math.round(m / step) * step;
  n.setMinutes(snapped >= 60 ? 60 - step : snapped, 0, 0);
  return n;
}
function applyPrecision(d: Date, precision: 'minute'|'hour', step: number): Date {
  const base = precision === 'hour' ? roundToHour(d) : d;
  return precision === 'minute' ? snapMinutes(base, step) : base;
}

const MASK_DATE = [/\d/, /\d/, '.', /\d/, /\d/, '.', /\d/, /\d/];
const MASK_DATETIME = [...MASK_DATE, ' ', /\d/, /\d/, ':', /\d/, /\d/];

function formatDisplay(d: Date, includeTime: boolean, precision: 'minute'|'hour') {
  if (!includeTime) return dayjs(d).format('DD.MM.YY');
  if (precision === 'hour') {
    const h = dayjs(d).minute(0).second(0);
    return h.format('DD.MM.YY HH:00');
  }
  return dayjs(d).format('DD.MM.YY HH:mm');
}

function parseStrict(text: string, includeTime: boolean, precision: 'minute'|'hour'): Date | null {
  const fmt = includeTime ? 'DD.MM.YY HH:mm' : 'DD.MM.YY';
  const d = dayjs(text, fmt, true);
  if (!d.isValid()) return null;
  const js = d.toDate();
  if (!includeTime || precision === 'minute') return js;
  // precision === 'hour' → мин. = 0
  js.setMinutes(0, 0, 0);
  return js;
}

export default function DateTimeInput({
  value,
  onChange,
  placeholder = '23.08.25 00:00',
  label,
  errorText,
  disabled,
  style,
  minDate,
  maxDate,
  disabledPast,
  disabledFuture,
  locale = 'ru-RU',
  includeTime = true,
  timePrecision = 'minute',
  minuteStep = 5,
  allowClear = false,
  onClear,
  onValidate,
  quickActions = true,
}: DateTimeInputProps) {
  const selected = useMemo(() => toDate(value), [value]);
  const [text, setText] = useState<string>(() =>
    selected ? formatDisplay(selected, includeTime, timePrecision) : ''
  );

  // ======== МОДАЛКА (оставлена без изменений по требованию) ========
  const [pickerMod, setPickerMod] = useState<any | null>(null);
  const [iosVisible, setIosVisible] = useState(false);
  const [temp, setTemp] = useState<Date>(() => applyPrecision(safeDate(value), timePrecision, minuteStep));
  const openedRef = useRef(false);

  // вычисляем финальные границы с учётом now/флагов
  const now = new Date();
  const computedMin = useMemo(() => {
    if (disabledPast) return minDate ? (minDate > now ? minDate : now) : now;
    return minDate;
  }, [disabledPast, minDate, now]);
  const computedMax = useMemo(() => {
    if (disabledFuture) return maxDate ? (maxDate < now ? maxDate : now) : now;
    return maxDate;
  }, [disabledFuture, maxDate, now]);

  // синхронизируем текст, если value пришло извне
  useEffect(() => {
    if (selected) {
      setText(formatDisplay(selected, includeTime, timePrecision));
      setTemp(applyPrecision(selected, timePrecision, minuteStep));
    } else {
      setText('');
    }
  }, [selected, includeTime, timePrecision, minuteStep]);

  // ленивый импорт пикера
  const ensureModule = useCallback(async () => {
    if (pickerMod) return pickerMod;
    try { const mod = await import('@react-native-community/datetimepicker'); setPickerMod(mod); return mod; }
    catch { Alert.alert('Нужен модуль даты', 'Установите @react-native-community/datetimepicker и перезапустите приложение.'); return null; }
  }, [pickerMod]);

  const validateAndEmit = useCallback((d: Date) => {
    // границы
    if (computedMin && d < computedMin) { Alert.alert('Некорректная дата', 'Дата раньше допустимой.'); return false; }
    if (computedMax && d > computedMax) { Alert.alert('Некорректная дата', 'Дата позже допустимой.'); return false; }
    if (onValidate) {
      const msg = onValidate(d);
      if (msg) { Alert.alert('Проверьте дату', msg); return false; }
    }
    const final = applyPrecision(d, timePrecision, minuteStep);
    onChange(final.toISOString(), final);
    return true;
  }, [computedMin, computedMax, onValidate, onChange, timePrecision, minuteStep]);

  const open = useCallback(async () => {
    if (disabled) return;
    const mod = await ensureModule(); if (!mod) return;
    const current = applyPrecision(safeDate(value), timePrecision, minuteStep);

    if (Platform.OS === 'android' && (mod as any).DateTimePickerAndroid) {
      if (openedRef.current) return; openedRef.current = true;
      const { DateTimePickerAndroid } = mod as any;

      // 1) DATE
      DateTimePickerAndroid.open({
        mode: 'date', value: current, is24Hour: true,
        minimumDate: computedMin, maximumDate: computedMax,
        onChange: (e: any, pickedDate?: Date) => {
          if (e.type !== 'set' || !pickedDate) { openedRef.current = false; return; }
          const base = new Date(pickedDate);
          if (!includeTime) {
            const nowLocal = applyPrecision(new Date(), timePrecision, minuteStep);
            base.setHours(nowLocal.getHours(), nowLocal.getMinutes(), 0, 0);
            openedRef.current = false; validateAndEmit(base); return;
          }
          // 2) TIME
          DateTimePickerAndroid.open({
            mode: 'time', value: current, is24Hour: true,
            onChange: (e2: any, pickedTime?: Date) => {
              openedRef.current = false;
              if (e2.type !== 'set' || !pickedTime) return;
              const final = new Date(base);
              final.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
              validateAndEmit(final);
            },
          });
        },
      });
      return;
    }

    // iOS (или web фолбэк): модалка со спиннером
    setTemp(current); setIosVisible(true);
  }, [disabled, ensureModule, value, timePrecision, minuteStep, computedMin, computedMax, includeTime, validateAndEmit]);

  // iOS подтверждение
  const iosConfirm = () => {
    const base = new Date(temp);
    if (!includeTime) {
      const nowLocal = applyPrecision(new Date(), timePrecision, minuteStep);
      base.setHours(nowLocal.getHours(), nowLocal.getMinutes(), 0, 0);
    }
    if (validateAndEmit(base)) setIosVisible(false);
  };
  const iosCancel = () => setIosVisible(false);

  // Быстрые пресеты для iOS
  const quicks = useMemo(() => {
    if (!quickActions) return [] as { label: string; getDate: () => Date }[];
    if (includeTime) {
      return [
        { label: 'Через 1 час', getDate: () => { const d = new Date(); d.setHours(d.getHours()+1); return d; }},
        { label: 'Сегодня 09:00', getDate: () => { const d = new Date(); d.setHours(9,0,0,0); return d; }},
        { label: 'Сегодня 18:00', getDate: () => { const d = new Date(); d.setHours(18,0,0,0); return d; }},
        { label: 'Завтра 09:00', getDate: () => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(9,0,0,0); return d; }},
      ];
    }
    return [
      { label: 'Сегодня', getDate: () => new Date() },
      { label: 'Завтра', getDate: () => { const d = new Date(); d.setDate(d.getDate()+1); return d; }},
      { label: 'Через неделю', getDate: () => { const d = new Date(); d.setDate(d.getDate()+7); return d; }},
    ];
  }, [quickActions, includeTime]);

  const useQuick = (getDate: () => Date) => {
    const d = applyPrecision(getDate(), timePrecision, minuteStep);
    setTemp(d);
  };

  const clearSelected = () => {
    if (!allowClear || disabled) return;
    if (onClear) onClear();
  };

  // ======== UI ========
  const mask = includeTime
    ? (timePrecision === 'hour' ? [...MASK_DATE, ' ', /\d/, /\d/] : MASK_DATETIME)
    : MASK_DATE;

  // placeholder по формату
  const ph = placeholder ?? (includeTime ? '23.08.25 00:00' : '23.08.25');

  // при потере фокуса валидируем строку и эмитим
  const commitText = () => {
    if (!text) return; // пустое — допускаем
    const parsed = parseStrict(text, includeTime, timePrecision);
    if (!parsed) {
      Alert.alert('Неверный формат', `Введите в формате ${includeTime ? 'ДД.ММ.ГГ ЧЧ:ММ' : 'ДД.ММ.ГГ'} (например, ${ph})`);
      // откат к последнему валидному
      if (selected) setText(formatDisplay(selected, includeTime, timePrecision));
      else setText('');
      return;
    }
    // границы
    const minB = computedMin;
    const maxB = computedMax;
    if (minB && parsed < minB) {
      Alert.alert('Дата вне диапазона', 'Выбрана дата раньше допустимой');
      if (selected) setText(formatDisplay(selected, includeTime, timePrecision)); else setText('');
      return;
    }
    if (maxB && parsed > maxB) {
      Alert.alert('Дата вне диапазона', 'Выбрана дата позже допустимой');
      if (selected) setText(formatDisplay(selected, includeTime, timePrecision)); else setText('');
      return;
    }
    setText(formatDisplay(parsed, includeTime, timePrecision));
    onChange(parsed.toISOString(), parsed);
  };

  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.inputWrap}>
        {/* Сам инпут для ручного ввода (цифровая клавиатура, маска, несъёмные точки и двоеточие) */}
        <MaskInput
          value={text}
          onChangeText={(masked) => setText(masked)}
          onBlur={commitText}
          editable={!disabled}
          mask={mask}
          placeholder={ph}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
          inputMode="numeric"
          returnKeyType="done"
          onSubmitEditing={commitText}
          style={styles.input}
          placeholderTextColor="#9CA3AF"
        />

        {/* кнопка-календарь (открывает модалку — логика не менялась) */}
        <Pressable
          onPress={open}
          disabled={disabled}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: true }}
          accessibilityRole="button"
          accessibilityLabel="Открыть календарь"
          hitSlop={8}
        >
          <Ionicons name="calendar" size={16} color="#111827" />
        </Pressable>

        {allowClear && selected && !disabled && (
          <Pressable onPress={clearSelected} hitSlop={10} style={styles.clearBtn} accessibilityLabel="Очистить дату">
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </Pressable>
        )}
      </View>

      {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

      {/* iOS modal (без изменений) */}
      {iosVisible && (
        <Modal transparent animationType="fade" visible onRequestClose={iosCancel}>
          <Pressable style={styles.backdrop} onPress={iosCancel} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{includeTime ? 'Выберите дату и время' : 'Выберите дату'}</Text>
            </View>

            {/* быстрые действия */}
            {quickActions && (
              <View style={styles.quickRow}>
                {quicks.map(q => (
                  <Pressable key={q.label} onPress={() => useQuick(q.getDate)} style={({pressed}) => [styles.quickChip, pressed && {opacity:0.85}]}> 
                    <Text style={styles.quickChipText}>{q.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {pickerMod && React.createElement((pickerMod as any).default ?? (pickerMod as any), {
              value: isValidDate(temp) ? temp : applyPrecision(new Date(), timePrecision, minuteStep),
              mode: includeTime ? 'datetime' : 'date',
              display: 'spinner',
              onChange: (_: any, d?: Date) => d && setTemp(d),
              minimumDate: computedMin,
              maximumDate: computedMax,
              ...(Platform.OS === 'ios' ? { locale } : {}),
              ...(includeTime && timePrecision === 'minute' && Platform.OS === 'ios'
                ? { minuteInterval: Math.min(Math.max(1, minuteStep), 30) }
                : {}),
              style: { backgroundColor: 'white' },
            })}

            <View style={styles.modalButtonsRow}>
              <Pressable onPress={iosCancel} style={[styles.modalBtn, styles.modalBtnGhost]}>
                <Text style={[styles.modalBtnText, styles.modalBtnGhostText]}>Отмена</Text>
              </Pressable>
              <Pressable onPress={iosConfirm} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>Готово</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: '#4B5563', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  inputWrap: {
    position: 'relative',
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff', borderRadius: 12,
    paddingLeft: 12, paddingRight: 84, // место под 2 иконки
    paddingVertical: Platform.OS === 'ios' ? 8 : 0,
  },
  input: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 10,
  },
  iconBtn: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#E0E7FF',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnPressed: { transform: [{ scale: 0.98 }], opacity: 0.96 },
  clearBtn: { position: 'absolute', right: 44, top: 6 },

  errorText: { color: '#EF4444', fontSize: 12 },

  // iOS modal styles (как было)
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
  modalCard: {
    position: 'absolute', left: 16, right: 16, bottom: 24,
    backgroundColor: '#fff', borderRadius: 16, padding: 12,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  modalHeader: { padding: 6, paddingBottom: 10 },
  modalTitle: { color: '#111827', fontWeight: '800', fontSize: 16 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4, paddingBottom: 8 },
  quickChip: { backgroundColor: '#F3F4F6', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  quickChipText: { color: '#111827', fontWeight: '700', fontSize: 12 },
  modalButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  modalBtn: { backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  modalBtnText: { color: '#fff', fontWeight: '800' },
  modalBtnGhost: { backgroundColor: '#F3F4F6' },
  modalBtnGhostText: { color: '#111827' },
});
