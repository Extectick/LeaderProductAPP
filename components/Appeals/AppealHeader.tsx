// V:\lp\components\Appeals\AppealHeader.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppealDetail } from '@/types/appealsTypes';

type Props = {
  data: AppealDetail;
  onChangeStatus?: () => void;
  onAssign?: () => void;
  onWatch?: () => void;
};

export default function AppealHeader({ data, onChangeStatus, onAssign, onWatch }: Props) {
  return (
    <Animated.View entering={FadeInDown.duration(250)}>
      <LinearGradient
        colors={['#0EA5E9', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <View style={styles.row}>
          <Text style={styles.number}>#{data.number}</Text>
          <View style={[styles.badge, { backgroundColor: statusColor(data.status) }]}>
            <Text style={styles.badgeText}>{data.status}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: priorityColor(data.priority) }]}>
            <Text style={styles.badgeText}>{data.priority}</Text>
          </View>
        </View>
        {data.title ? <Text style={styles.title}>{data.title}</Text> : null}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={onChangeStatus}>
            <Text style={styles.actionText}>Статус</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onAssign}>
            <Text style={styles.actionText}>Назначить</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onWatch}>
            <Text style={styles.actionText}>Наблюдать</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function statusColor(status: string) {
  switch (status) {
    case 'OPEN': return '#4CAF50';
    case 'IN_PROGRESS': return '#2196F3';
    case 'RESOLVED': return '#9C27B0';
    case 'CLOSED': return '#9E9E9E';
    default: return '#607D8B';
  }
}

function priorityColor(priority: string) {
  switch (priority) {
    case 'LOW': return '#8BC34A';
    case 'MEDIUM': return '#FFC107';
    case 'HIGH': return '#FF5722';
    case 'CRITICAL': return '#F44336';
    default: return '#9E9E9E';
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  number: { fontSize: 18, fontWeight: 'bold', marginRight: 8, color: '#fff' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 6 },
  badgeText: { color: '#fff', fontSize: 12 },
  title: { fontSize: 16, marginBottom: 8, color: '#fff' },
  actions: { flexDirection: 'row' },
  actionBtn: { marginRight: 12 },
  actionText: { color: '#fff', fontSize: 14 },
});
