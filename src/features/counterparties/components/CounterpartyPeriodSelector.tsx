import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CounterpartySalesPeriod } from '../model/counterpartyCard.types';
import { CustomPeriodDialog, formatPeriodRange, type CustomPeriodRange } from './CustomPeriodDialog';

const PERIODS: Array<{ key: CounterpartySalesPeriod; label: string }> = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'quarter', label: 'Квартал' },
  { key: 'halfYear', label: 'Полгода' },
  { key: 'custom', label: 'Свой' },
];

export type CounterpartyPeriodRange = CustomPeriodRange;

export function CounterpartyPeriodSelector({ period, customRange, onPeriodChange, onCustomPeriodApply }: {
  period: CounterpartySalesPeriod;
  customRange: CounterpartyPeriodRange | null;
  onPeriodChange: (period: CounterpartySalesPeriod) => void;
  onCustomPeriodApply: (range: CounterpartyPeriodRange) => void;
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  return <>
    <View style={styles.periods}>{PERIODS.map((item) => <Pressable key={item.key} onPress={() => item.key === 'custom' ? setDialogOpen(true) : onPeriodChange(item.key)} style={[styles.period, period === item.key && styles.periodActive]}><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.periodText, period === item.key && styles.periodTextActive]}>{item.label}</Text></Pressable>)}</View>
    {period === 'custom' && customRange ? <Pressable onPress={() => setDialogOpen(true)} style={styles.customRange}><Text style={styles.customRangeText}>{formatPeriodRange(customRange)}</Text></Pressable> : null}
    <CustomPeriodDialog visible={dialogOpen} initialRange={customRange} onDismiss={() => setDialogOpen(false)} onApply={(range) => { setDialogOpen(false); onCustomPeriodApply(range); }} />
  </>;
}

const styles = StyleSheet.create({
  periods: { flexDirection: 'row', backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  period: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 2 },
  periodActive: { backgroundColor: '#EAF2FF' },
  periodText: { color: '#64748B', fontSize: 10.5, fontWeight: '700' },
  periodTextActive: { color: '#2563EB', fontWeight: '900' },
  customRange: { minHeight: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DBEAFE', borderRadius: 10, backgroundColor: '#EFF6FF', paddingHorizontal: 12 },
  customRangeText: { color: '#2563EB', fontSize: 12, fontWeight: '800' },
});
