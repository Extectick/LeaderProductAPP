import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AnimatedRe, { FadeInDown } from 'react-native-reanimated';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import Dropdown, { DropdownItem } from '@/components/ui/Dropdown';
import AppealStatusMenu from './AppealStatusMenu';
import { AppealDetail, AppealStatus, AppealPriority } from '@/types/appealsTypes';

type Props = {
  data: AppealDetail;
  title?: string;
  onChangeStatus?: (s: AppealStatus) => void;
  onAssign?: () => void;
  onWatch?: () => void;
};

const statusLabels: Record<AppealStatus, string> = {
  OPEN: 'Открыто',
  IN_PROGRESS: 'В работе',
  RESOLVED: 'Решено',
  CLOSED: 'Закрыто',
};

const priorityLabels: Record<AppealPriority, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  CRITICAL: 'Критический',
};

export default function AppealHeader({
  data,
  title,
  onChangeStatus,
  onAssign,
  onWatch,
}: Props) {
  const displayTitle = title ?? data.title ?? data.messages[0]?.text ?? 'Без названия';
  const fromDept = data.fromDepartment?.name ?? '—';
  const toDept = data.toDepartment.name;
  const createdAt = dayjs(data.createdAt).format('DD.MM.YY HH:mm');
  const formattedDeadline = data.deadline
    ? dayjs(data.deadline).format('DD.MM.YY HH:mm')
    : null;

  const progress = useMemo(() => {
    if (!data.deadline) return null;
    const start = dayjs(data.createdAt);
    const end = dayjs(data.deadline);
    const total = end.diff(start);
    if (total <= 0) return 1;
    const current = dayjs().diff(start);
    return Math.min(current / total, 1);
  }, [data.createdAt, data.deadline]);

  const isOverdue = progress !== null && progress >= 1;

  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (progress !== null) {
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 500,
        useNativeDriver: false,
      }).start();
    }
  }, [progress]);

  const [statusMenuVisible, setStatusMenuVisible] = useState(false);

  const actionItems: DropdownItem<'status' | 'assign' | 'watch'>[] = [
    { label: 'Изменить статус', value: 'status' },
    { label: 'Назначить', value: 'assign' },
    { label: 'Наблюдать', value: 'watch' },
  ];

  const handleAction = (action: 'status' | 'assign' | 'watch') => {
    switch (action) {
      case 'status':
        setStatusMenuVisible(true);
        break;
      case 'assign':
        onAssign?.();
        break;
      case 'watch':
        onWatch?.();
        break;
    }
  };

  const handleSelectStatus = (s: AppealStatus) => {
    setStatusMenuVisible(false);
    onChangeStatus?.(s);
  };

  return (
    <AnimatedRe.View entering={FadeInDown.duration(250)} style={{ marginBottom: 16 }}>
      <LinearGradient
        colors={['#0EA5E9', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <Dropdown
          items={actionItems}
          onChange={handleAction}
          placeholder=""
          style={styles.menuWrap}
          buttonStyle={styles.menuButton}
          renderTrigger={() => (
            <Ionicons name="ellipsis-vertical" size={18} color="#0B1220" />
          )}
        />

        <View style={styles.headerTextBlock}>
          <Text style={styles.title}>{displayTitle}</Text>
          <Text style={styles.departments}>
            {fromDept} → {toDept}
          </Text>
        </View>

        {progress !== null && (
          <View style={styles.progressContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                  backgroundColor: isOverdue ? '#F43F5E' : '#fff',
                },
              ]}
            />
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.number}>#{data.number}</Text>
          <View style={[styles.badge, { backgroundColor: statusColor(data.status) }]}>
            <Text style={styles.badgeText}>{statusLabels[data.status]}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: priorityColor(data.priority) }]}>
            <Text style={styles.badgeText}>{priorityLabels[data.priority]}</Text>
          </View>
        </View>

        <View style={styles.datesRow}>
          <Text style={styles.date}>{createdAt}</Text>
          {formattedDeadline && (
            <Text style={[styles.date, isOverdue && styles.deadlineOverdue]}>
              → {formattedDeadline}
            </Text>
          )}
        </View>
      </LinearGradient>

      <AppealStatusMenu
        visible={statusMenuVisible}
        current={data.status}
        onSelect={handleSelectStatus}
        onClose={() => setStatusMenuVisible(false)}
      />
    </AnimatedRe.View>
  );
}

function statusColor(status: AppealStatus) {
  switch (status) {
    case 'OPEN':
      return '#4CAF50';
    case 'IN_PROGRESS':
      return '#2196F3';
    case 'RESOLVED':
      return '#9C27B0';
    case 'CLOSED':
      return '#9E9E9E';
    default:
      return '#607D8B';
  }
}

function priorityColor(priority: AppealPriority) {
  switch (priority) {
    case 'LOW':
      return '#8BC34A';
    case 'MEDIUM':
      return '#FFC107';
    case 'HIGH':
      return '#FF5722';
    case 'CRITICAL':
      return '#F44336';
    default:
      return '#9E9E9E';
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    paddingTop: 20,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  menuWrap: { position: 'absolute', top: 10, right: 10, zIndex: 2 },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  headerTextBlock: { marginBottom: 12, paddingRight: 48 },
  title: { color: '#fff', fontWeight: '800', fontSize: 20, letterSpacing: 0.2 },
  departments: { color: 'rgba(255,255,255,0.95)', fontSize: 12, marginTop: 4 },
  progressContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: { height: '100%' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  number: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  datesRow: { flexDirection: 'row' },
  date: { fontSize: 12, color: 'rgba(255,255,255,0.95)', marginRight: 8 },
  deadlineOverdue: { color: '#F43F5E' },
});

export {};

