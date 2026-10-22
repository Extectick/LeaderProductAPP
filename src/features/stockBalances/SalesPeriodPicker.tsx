import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { periodLabel, salesPeriod, type SalesPeriod, type SalesPreset } from './salesAnalytics';

const options: { key: SalesPreset; label: string }[] = [{ key: 'week', label: 'Последние 7 дней' }, { key: 'month', label: 'Последние 30 дней' }, { key: 'current', label: 'Текущий месяц' }, { key: 'previous', label: 'Прошлый месяц' }];
export function SalesPeriodPicker({ value, onChange }: { value: SalesPeriod; onChange: (value: SalesPeriod) => void }) {
  const [open, setOpen] = React.useState(false);
  const insets = useSafeAreaInsets();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Период продаж: ${value.from} — ${value.to}`} onPress={() => setOpen(true)} style={styles.trigger}>
      <MaterialCommunityIcons name="calendar-range" size={20} color="#2563EB" /><Text style={styles.label}>{periodLabel(value)}</Text><MaterialCommunityIcons name="chevron-down" size={17} color="#2563EB" />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.backdrop} accessibilityLabel="Закрыть выбор периода" onPress={() => setOpen(false)} />
      <View style={[styles.menu, { top: insets.top + 55 }]} accessibilityViewIsModal>
        {options.map(option => <Pressable key={option.key} accessibilityRole="button" style={styles.option} onPress={() => { onChange(salesPeriod(option.key)); setOpen(false); }}><Text>{option.label}</Text></Pressable>)}
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingRight: 12 }, label: { fontSize: 13, color: '#2563EB', fontWeight: '700' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15,23,42,0.08)' },
  menu: { position: 'absolute', right: 12, width: 230, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, elevation: 6 },
  option: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 16 },
});
