import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export type CustomPeriodRange = { from: string; to: string };

function toIsoDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDay(value?: string | null) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function formatPeriodRange(range?: CustomPeriodRange | null) {
  if (!range) return '';
  return `${parseDay(range.from).toLocaleDateString('ru-RU')} — ${parseDay(range.to).toLocaleDateString('ru-RU')}`;
}

export function CustomPeriodDialog({ visible, initialRange, onDismiss, onApply }: { visible: boolean; initialRange?: CustomPeriodRange | null; onDismiss: () => void; onApply: (range: CustomPeriodRange) => void }) {
  const defaultTo = React.useMemo(() => new Date(), []);
  const defaultFrom = React.useMemo(() => { const date = new Date(); date.setMonth(date.getMonth() - 1); return date; }, []);
  const [from, setFrom] = React.useState(() => parseDay(initialRange?.from || toIsoDay(defaultFrom)));
  const [to, setTo] = React.useState(() => parseDay(initialRange?.to || toIsoDay(defaultTo)));
  const [selecting, setSelecting] = React.useState<'from' | 'to' | null>(null);
  const invalid = from.getTime() > to.getTime();

  React.useEffect(() => {
    if (!visible) return;
    setFrom(parseDay(initialRange?.from || toIsoDay(defaultFrom)));
    setTo(parseDay(initialRange?.to || toIsoDay(defaultTo)));
    setSelecting(null);
  }, [defaultFrom, defaultTo, initialRange?.from, initialRange?.to, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.dialog} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>Произвольный период</Text>
          <View style={styles.fields}>
            <Pressable onPress={() => setSelecting('from')} style={[styles.field, selecting === 'from' && styles.fieldActive]}><Text style={styles.label}>Дата с</Text><Text style={styles.value}>{from.toLocaleDateString('ru-RU')}</Text></Pressable>
            <Pressable onPress={() => setSelecting('to')} style={[styles.field, selecting === 'to' && styles.fieldActive]}><Text style={styles.label}>Дата по</Text><Text style={styles.value}>{to.toLocaleDateString('ru-RU')}</Text></Pressable>
          </View>
          {selecting ? (
            <DateTimePicker
              value={selecting === 'from' ? from : to}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              onValueChange={(_event, value) => {
                if (selecting === 'from') setFrom(value); else setTo(value);
              }}
              onDismiss={() => setSelecting(null)}
            />
          ) : null}
          {invalid ? <Text style={styles.error}>Дата начала должна быть раньше даты окончания</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onDismiss} style={styles.action}><Text style={styles.cancel}>Отмена</Text></Pressable>
            <Pressable disabled={invalid} onPress={() => onApply({ from: toIsoDay(from), to: toIsoDay(to) })} style={[styles.action, styles.apply, invalid && styles.disabled]}><Text style={styles.applyText}>Применить</Text></Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.34)', padding: 18 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 18, backgroundColor: '#FFFFFF', padding: 16, gap: 14 },
  title: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  fields: { flexDirection: 'row', gap: 8 }, field: { flex: 1, minHeight: 58, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#CBD5E1', paddingHorizontal: 4 }, fieldActive: { borderBottomWidth: 2, borderBottomColor: '#2563EB' },
  label: { color: '#64748B', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }, value: { color: '#1E293B', fontSize: 15, fontWeight: '800', marginTop: 3 },
  error: { color: '#DC2626', fontSize: 12, fontWeight: '700' }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, action: { minHeight: 42, justifyContent: 'center', borderRadius: 11, paddingHorizontal: 16 }, apply: { backgroundColor: '#2563EB' }, disabled: { opacity: 0.45 }, cancel: { color: '#475569', fontWeight: '800' }, applyText: { color: '#FFFFFF', fontWeight: '900' },
});
