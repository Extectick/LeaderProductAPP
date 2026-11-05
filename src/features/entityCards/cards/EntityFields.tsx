import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, type ThemeKey } from '@/constants/Colors';
import { useTheme } from '@/context/ThemeContext';
import type { EntityField, EntityTarget, EntityValue } from '../entityTypes';

export function useEntityColors() {
  const { theme } = useTheme();
  return Colors[theme as ThemeKey] || Colors.light;
}

export const entityValueText = (value: EntityValue | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return value.label;
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return typeof value === 'number' ? value.toLocaleString('ru-RU', { maximumFractionDigits: 20 }) : value;
};

export function EntityValueText({ value, onOpen, prominent = false }: {
  value: EntityValue | undefined; onOpen: (target: EntityTarget, label: string) => void; prominent?: boolean;
}) {
  const colors = useEntityColors(), label = entityValueText(value);
  const text = <Text selectable={!(value && typeof value === 'object')} style={[styles.value, { color: colors.text }, prominent && styles.prominent,
    value && typeof value === 'object' ? { color: colors.tint, textDecorationLine: 'underline' } : undefined]}>{label}</Text>;
  if (value && typeof value === 'object') return <Pressable accessibilityRole="link" accessibilityLabel={label}
    accessibilityHint="Открыть карточку" onPress={() => onOpen(value.target, value.label)} style={styles.link}>{text}</Pressable>;
  return text;
}

export function EntityFields({ fields, onOpen }: { fields: EntityField[]; onOpen: (target: EntityTarget, label: string) => void }) {
  const colors = useEntityColors();
  return <View testID="entity-card-fields" style={styles.fields}>{fields.map(field => <View key={field.key} style={[styles.row, { borderBottomColor: colors.inputBorder }]}>
    <Text style={[styles.label, { color: colors.secondaryText }]}>{field.label}</Text>
    <View style={styles.valueColumn}><EntityValueText value={field.value} onOpen={onOpen} /></View>
  </View>)}</View>;
}

const styles = StyleSheet.create({
  fields: { gap: 0 }, row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { flex: 0.9, fontSize: 13, lineHeight: 20 }, valueColumn: { flex: 1.25, minWidth: 0 },
  value: { fontSize: 15, lineHeight: 22 }, prominent: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  link: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: 3 },
});
