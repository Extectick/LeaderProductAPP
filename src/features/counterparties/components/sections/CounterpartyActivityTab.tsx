import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CounterpartyCardBootstrap } from '../../model/counterpartyCard.types';

export function CounterpartyActivityTab(_: { data: CounterpartyCardBootstrap; refreshing: boolean; onRefresh: () => void; onRetry: () => void }) {
  return <View style={styles.root}>
    <View style={styles.icon}><MaterialCommunityIcons name="tools" size={48} color="#2563EB" /></View>
    <Text style={styles.title}>В разработке</Text>
    <Text style={styles.text}>Здесь появится история взаимодействий с контрагентом.</Text>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', padding: 32, gap: 10 }, icon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF2FF' }, title: { color: '#0F172A', fontSize: 19, fontWeight: '900' }, text: { maxWidth: 290, color: '#64748B', fontSize: 13, fontWeight: '600', lineHeight: 19, textAlign: 'center' } });
