import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type CustomPeriodRange = { from: string; to: string };

function parseDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
}

export function formatPeriodRange(range?: CustomPeriodRange | null) {
  return range ? `${parseDay(range.from)} — ${parseDay(range.to)}` : '';
}

function isoToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function CustomPeriodDialog({ visible, initialRange, onDismiss, onApply }: { visible: boolean; initialRange?: CustomPeriodRange | null; onDismiss: () => void; onApply: (range: CustomPeriodRange) => void }) {
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  React.useEffect(() => {
    if (!visible) return;
    const today = isoToday();
    const start = new Date(`${today}T00:00:00`); start.setMonth(start.getMonth() - 1);
    const defaultFrom = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    setFrom(initialRange?.from || defaultFrom);
    setTo(initialRange?.to || today);
  }, [initialRange?.from, initialRange?.to, visible]);
  const invalid = !from || !to || from > to;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.dialog} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>Произвольный период</Text>
          <View style={styles.fields}>
            <View style={styles.field}><Text style={styles.label}>Дата с</Text>{React.createElement('input', { type: 'date', value: from, max: to || isoToday(), onChange: (event: React.ChangeEvent<HTMLInputElement>) => setFrom(event.target.value), style: inputStyle })}</View>
            <View style={styles.field}><Text style={styles.label}>Дата по</Text>{React.createElement('input', { type: 'date', value: to, min: from || undefined, max: isoToday(), onChange: (event: React.ChangeEvent<HTMLInputElement>) => setTo(event.target.value), style: inputStyle })}</View>
          </View>
          {invalid ? <Text style={styles.error}>Укажите корректный диапазон дат</Text> : null}
          <View style={styles.actions}><Pressable onPress={onDismiss} style={styles.action}><Text style={styles.cancel}>Отмена</Text></Pressable><Pressable disabled={invalid} onPress={() => onApply({ from, to })} style={[styles.action, styles.apply, invalid && styles.disabled]}><Text style={styles.applyText}>Применить</Text></Pressable></View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', height: 38, border: 0, borderBottom: '1px solid #CBD5E1', color: '#1E293B', background: 'transparent', fontSize: 15, fontWeight: 700, outline: 'none' };
const styles = StyleSheet.create({ backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.34)', padding: 18 }, dialog: { width: '100%', maxWidth: 420, borderRadius: 18, backgroundColor: '#FFFFFF', padding: 16, gap: 14 }, title: { color: '#0F172A', fontSize: 17, fontWeight: '900' }, fields: { flexDirection: 'row', gap: 10 }, field: { flex: 1, gap: 4 }, label: { color: '#64748B', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }, error: { color: '#DC2626', fontSize: 12, fontWeight: '700' }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, action: { minHeight: 42, justifyContent: 'center', borderRadius: 11, paddingHorizontal: 16 }, apply: { backgroundColor: '#2563EB' }, disabled: { opacity: 0.45 }, cancel: { color: '#475569', fontWeight: '800' }, applyText: { color: '#FFFFFF', fontWeight: '900' } });
