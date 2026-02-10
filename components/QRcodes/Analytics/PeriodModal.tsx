import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export const PERIODS = [
  { key: '24h', label: 'За 24 часа', subtract: () => new Date(Date.now() - 24 * 60 * 60 * 1000) },
  { key: '7d',  label: 'За 7 дней',  subtract: () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  { key: '30d', label: 'За 30 дней', subtract: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  { key: '1y',  label: 'За год',     subtract: () => new Date(new Date().setFullYear(new Date().getFullYear() - 1)) },
  { key: 'all', label: 'За всё время', subtract: () => new Date(0) },
  { key: 'custom', label: 'Произвольно', subtract: null as any },
] as const;

export type PeriodKey = typeof PERIODS[number]['key'];

type Props = {
  visible: boolean;
  onClose: () => void;
  current: PeriodKey;
  currentFrom: Date | null;
  currentTo: Date | null;
  onApply: (key: PeriodKey, from?: Date | null, to?: Date | null) => void;
};

const fmtInput = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : '';

const clampDate = (d: Date | null) => (d && !isNaN(d.getTime()) ? d : null);

export default function PeriodModal({
  visible, onClose, current, currentFrom, currentTo, onApply,
}: Props) {
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const styles = getStyles(colors);

  const [localKey, setLocalKey] = useState<PeriodKey>(current);
  const [fromStr, setFromStr] = useState<string>(fmtInput(currentFrom));
  const [toStr, setToStr] = useState<string>(fmtInput(currentTo));

  // локальные пикеры дат (нативные)
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  // синхронизировать при открытии
  React.useEffect(() => {
    if (!visible) return;
    setLocalKey(current);
    setFromStr(fmtInput(currentFrom));
    setToStr(fmtInput(currentTo));
  }, [visible, current, currentFrom, currentTo]);

  const canApply = useMemo(() => {
    if (localKey !== 'custom') return true;
    if (!fromStr || !toStr) return false;
    const f = new Date(fromStr);
    const t = new Date(toStr);
    if (isNaN(f.getTime()) || isNaN(t.getTime())) return false;
    return f.getTime() <= t.getTime();
  }, [localKey, fromStr, toStr]);

  const parsedFrom = clampDate(fromStr ? new Date(fromStr) : null);
  const parsedTo = clampDate(toStr ? new Date(toStr) : null);

  // --- Вспом. компоненты даты ---
  const renderWebDateInput = (value: string, onChange: (s: string) => void) => {
    // RN-web допускает нативный input
     
    return <input
      type="date"
      value={value}
      onChange={(e) => onChange((e.target as HTMLInputElement).value)}
      style={{
        height: 32,
        border: 'none',
        borderRadius: 8,
        padding: '0 4px',
        width: '100%',
        background: 'transparent',
        color: colors.text as string,
        outline: 'none',
        fontWeight: 700,
        fontSize: 14,
      }}
    />;
  };

  const renderNativeDateButton = (label: string, val: string, onPress: () => void) => (
    <Pressable style={styles.dateBtn} onPress={onPress}>
      <Ionicons name="calendar" size={16} color={colors.text} />
      <Text style={styles.dateBtnText}>
        {val || (label === 'from' ? 'Выберите дату' : 'Выберите дату')}
      </Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* фон для закрытия */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* карточка */}
        <View style={styles.card}>
          {/* Шапка */}
          <View style={styles.header}>
            <Text style={styles.title}>Период</Text>
            <Pressable style={styles.ghostIcon} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          </View>

          {/* Список пресетов */}
          <ScrollView
            style={{ maxHeight: 300 }}
            contentContainerStyle={{ paddingVertical: 4 }}
            keyboardShouldPersistTaps="handled"
          >
            {PERIODS.map((p) => {
              const active = localKey === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setLocalKey(p.key)}
                  style={[styles.periodRow, active && styles.periodRowActive]}
                >
                  <Text
                    style={[styles.periodLabel, active && { color: '#1D4ED8', fontWeight: '800' }]}
                    numberOfLines={2}
                  >
                    {p.label}
                  </Text>
                  {active && <Ionicons name="checkmark" size={16} color="#1D4ED8" />}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Произвольный диапазон */}
          {localKey === 'custom' && (
            <View style={styles.customBox}>
              <View style={styles.customHeader}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
                  Произвольный диапазон
                </Text>
                {!canApply && (
                  <Text style={{ color: '#F97316', fontWeight: '700', fontSize: 12 }}>Заполните даты</Text>
                )}
              </View>

              <View style={styles.inputRow}>
                <View style={styles.rangeField}>
                  <Text style={styles.inputLabel}>С</Text>
                  <View style={styles.inputShell}>
                    <View style={{ flex: 1 }}>
                      {Platform.OS === 'web' ? (
                        renderWebDateInput(fromStr, setFromStr)
                      ) : (
                        renderNativeDateButton('from', fromStr, () => setShowFromPicker(true))
                      )}
                    </View>
                  </View>
                </View>

                <View style={styles.rangeField}>
                  <Text style={styles.inputLabel}>По</Text>
                  <View style={styles.inputShell}>
                    <View style={{ flex: 1 }}>
                      {Platform.OS === 'web' ? (
                        renderWebDateInput(toStr, setToStr)
                      ) : (
                        renderNativeDateButton('to', toStr, () => setShowToPicker(true))
                      )}
                    </View>
                  </View>
                </View>
              </View>

              <Text style={{ color: colors.secondaryText, fontSize: 12, marginTop: 10 }}>
                {fromStr && toStr
                  ? `С ${fromStr} по ${toStr}`
                  : 'Введите обе даты, затем нажмите «Применить». Диапазон включителен.'}
              </Text>
            </View>
          )}

          {/* Футер */}
          <View style={styles.footer}>
            <Pressable
              style={[styles.primaryBtn, !canApply && { opacity: 0.5 }]}
              disabled={!canApply}
              onPress={() => {
                if (localKey !== 'custom') {
                  onApply(localKey);
                  return;
                }
                const f = clampDate(fromStr ? new Date(fromStr) : null);
                const t = clampDate(toStr ? new Date(toStr) : null);
                onApply('custom', f, t);
              }}
            >
              <Ionicons name="checkmark" size={16} color="#0B1220" />
              <Text style={styles.primaryBtnText}>Применить</Text>
            </Pressable>
          </View>
        </View>

        {/* Нативные пикеры (Android/iOS) в оверлее */}
        {showFromPicker && (
          <View style={styles.pickerSheet}>
            <View style={styles.pickerCard}>
              <Text style={styles.pickerTitle}>Дата (С)</Text>
              <DateTimePicker
                mode="date"
                value={parsedFrom || new Date()}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(e: any, d?: Date) => {
                  // Android: закрыть сразу после выбора
                  if (Platform.OS === 'android') setShowFromPicker(false);
                  if (d) setFromStr(fmtInput(d));
                }}
              />
              {Platform.OS === 'ios' && (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <Pressable style={styles.secondaryBtn} onPress={() => setShowFromPicker(false)}>
                    <Text style={styles.secondaryBtnText}>Отмена</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => setShowFromPicker(false)}
                  >
                    <Text style={styles.primaryBtnText}>Готово</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}

        {showToPicker && (
          <View style={styles.pickerSheet}>
            <View style={styles.pickerCard}>
              <Text style={styles.pickerTitle}>Дата (По)</Text>
              <DateTimePicker
                mode="date"
                value={parsedTo || new Date()}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(e: any, d?: Date) => {
                  if (Platform.OS === 'android') setShowToPicker(false);
                  if (d) setToStr(fmtInput(d));
                }}
              />
              {Platform.OS === 'ios' && (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <Pressable style={styles.secondaryBtn} onPress={() => setShowToPicker(false)}>
                    <Text style={styles.secondaryBtnText}>Отмена</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => setShowToPicker(false)}
                  >
                    <Text style={styles.primaryBtnText}>Готово</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    // отдельный «задник», чтобы кликом закрывать форму
    backdrop: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    card: {
      width: '96%',
      maxWidth: 560,
      maxHeight: '86%',
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      padding: 14,
      ...Platform.select({
        web: { boxShadow: '0px 10px 24px rgba(0,0,0,0.18)' },
        ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
        android: { elevation: 10 },
      }),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#EFF2F6',
      marginBottom: 10,
    },
    title: { color: colors.text, fontSize: 16, fontWeight: '800', flexShrink: 1 },
    periodRow: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderTopWidth: 1,
      borderTopColor: '#F3F4F6',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    periodRowActive: {
      backgroundColor: Platform.OS === 'web' ? '#F9FAFB' : colors.background,
    },
    periodLabel: { color: colors.text, flex: 1, flexWrap: 'wrap' },

    customBox: {
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 12,
      padding: 12,
      marginTop: 12,
      backgroundColor: colors.background,
      gap: 10,
    },
    customHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      flexWrap: Platform.OS === 'web' ? 'nowrap' as any : 'wrap' as any,
    },
    rangeField: { flex: 1, minWidth: Platform.OS === 'web' ? 0 : '100%', gap: 6 },
    inputLabel: { color: colors.secondaryText, fontSize: 12, marginBottom: 6 },
    inputShell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 0,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: '#fff',
      width: '100%',
    },
    input: {
      height: 36,
      borderWidth: 0,
      borderColor: '#E5E7EB',
      borderRadius: 8,
      paddingHorizontal: 8,
      color: colors.text,
      backgroundColor: 'transparent',
    },

    footer: {
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: '#EFF2F6',
      alignItems: 'flex-end',
    },
    primaryBtn: {
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fff',
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: '#D1D5DB',
    },
    primaryBtnText: { color: '#0B1220', fontWeight: '800', marginLeft: 6 },
    secondaryBtn: {
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },
    secondaryBtnText: { color: colors.text, fontWeight: '700' },

    ghostIcon: {
      height: 36,
      width: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
    },

    // всплывающее окошко с нативным пикером (внутри общей модалки)
    pickerSheet: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    pickerCard: {
      width: '90%',
      maxWidth: 420,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      backgroundColor: colors.cardBackground,
      padding: 12,
    },
    pickerTitle: { color: colors.text, fontWeight: '800', marginBottom: 8 },
    dateBtn: {
      height: 38,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 10,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background,
    },
    dateBtnText: { color: colors.text, fontWeight: '600' },
  });
