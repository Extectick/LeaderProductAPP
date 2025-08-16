import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  totals?: { scans: number; uniqueIPs: number; uniqueDevices: number };
  colors: any;
};

export default function MetricsRow({ totals, colors }: Props) {
  return (
    <View style={styles.row}>
      <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
        <Text style={[styles.title, { color: colors.secondaryText }]}>Сканы</Text>
        <Text style={[styles.value, { color: colors.text }]}>{totals?.scans ?? 0}</Text>
      </View>
      <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
        <Text style={[styles.title, { color: colors.secondaryText }]}>Уникальные IP</Text>
        <Text style={[styles.value, { color: colors.text }]}>{totals?.uniqueIPs ?? 0}</Text>
      </View>
      <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
        <Text style={[styles.title, { color: colors.secondaryText }]}>Устройства</Text>
        <Text style={[styles.value, { color: colors.text }]}>{totals?.uniqueDevices ?? 0}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 12 },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#EEF2FF',
    borderRadius: 12,
    padding: 12,
    marginRight: 8,
  },
  title: { fontSize: 12, fontWeight: '700' },
  value: { fontSize: 18, fontWeight: '800', marginTop: 4 },
});
