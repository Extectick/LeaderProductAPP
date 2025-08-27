// V:\lp\components\Appeals\AppealHeader.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import dayjs from 'dayjs';
import { AppealDetail } from '@/types/appealsTypes';

type Props = {
  data: AppealDetail;
  title?: string;
  onChangeStatus?: () => void;
  onAssign?: () => void;
  onWatch?: () => void;
};

export default function AppealHeader({
  data,
  title = data.title || 'Без названия',
  onChangeStatus,
  onAssign,
  onWatch,
}: Props) {
  const fromDept = data.fromDepartment?.name ?? '—';
  const toDept = data.toDepartment.name;
  const createdAt = dayjs(data.createdAt).format('DD.MM.YY HH:mm');
  const formattedDeadline = data.deadline ? dayjs(data.deadline).format('DD.MM.YY HH:mm') : null;
  const isOverdue = formattedDeadline ? dayjs().isAfter(dayjs(data.deadline)) : false;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.departments}>{fromDept} → {toDept}</Text>
      <View style={styles.datesRow}>
        <Text style={styles.date}>{createdAt}</Text>
        {formattedDeadline ? (
          <Text style={[styles.date, isOverdue && styles.deadlineOverdue]}>→ {formattedDeadline}</Text>
        ) : null}
      </View>
      <View style={styles.row}>
        <Text style={styles.number}>#{data.number}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor(data.status) }]}>
          <Text style={styles.badgeText}>{data.status}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: priorityColor(data.priority) }]}>
          <Text style={styles.badgeText}>{data.priority}</Text>
        </View>
      </View>
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
    </View>
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
  container: { padding: 16, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 4, color: '#333' },
  departments: { fontSize: 14, color: '#666', marginBottom: 4 },
  datesRow: { flexDirection: 'row', marginBottom: 8 },
  date: { fontSize: 12, color: '#666', marginRight: 8 },
  deadlineOverdue: { color: '#F44336' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  number: { fontSize: 18, fontWeight: 'bold', marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 6 },
  badgeText: { color: '#fff', fontSize: 12 },
  actions: { flexDirection: 'row' },
  actionBtn: { marginRight: 12 },
  actionText: { color: '#007AFF', fontSize: 14 },
});
