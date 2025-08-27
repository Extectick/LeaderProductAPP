// =============================
// File: V:\lp\components\Appeals\AppealHeader.tsx
// - улучшено меню действий (иконка на прозрачной кнопке)
// - чипы подразделений с «нажатием» (PressableScale)
// - прогресс + подписи дат под прогрессом
// - аккуратные тени/отступы и анимация появления
// =============================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
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

const PressableScale: React.FC<{
  onPress?: () => void;
  style?: any;
  pressedStyle?: any;
  children: React.ReactNode;
}> = ({ onPress, style, pressedStyle, children }) => {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }).start()
      }
      onPressOut={() =>
        Animated.timing(scale, { toValue: 1, duration: 110, useNativeDriver: true }).start()
      }
    >
      {({ pressed }) => (
        <Animated.View style={[style, pressed && pressedStyle, { transform: [{ scale }] }]}>
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
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
  const formattedDeadline = data.deadline ? dayjs(data.deadline).format('DD.MM.YY HH:mm') : null;

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
  }, [progress, progressAnim]);

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
    <AnimatedRe.View entering={FadeInDown.duration(250)} style={styles.wrapper}>
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
          buttonStyle={styles.iconBtn}
          renderTrigger={() => <Ionicons name="ellipsis-horizontal" size={18} color="#fff" />}
        />

        <View style={styles.headerTextBlock}>
          <Text style={styles.title}>{displayTitle}</Text>
          <View style={styles.deptRow}>
            <PressableScale style={styles.deptChip} pressedStyle={styles.deptChipPressed}>
              <Text style={styles.deptText}>{fromDept}</Text>
            </PressableScale>
            <Ionicons name="chevron-forward" size={14} color="#fff" style={{ marginHorizontal: 4 }} />
            <PressableScale style={styles.deptChip} pressedStyle={styles.deptChipPressed}>
              <Text style={styles.deptText}>{toDept}</Text>
            </PressableScale>
          </View>
        </View>

        {progress !== null && (
          <View style={styles.deadlineWrap}>
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
            <View style={styles.deadlineDates}>
              <Text style={styles.date}>{createdAt}</Text>
              {formattedDeadline && (
                <Text style={[styles.date, isOverdue && styles.deadlineOverdue]}>
                  {formattedDeadline}
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.number}>#{data.number}</Text>
          <PressableScale
            onPress={() => setStatusMenuVisible(true)}
            style={[styles.badge, { backgroundColor: statusColor(data.status) }]}
            pressedStyle={{ opacity: 0.85 }}
          >
            <Text style={styles.badgeText}>{statusLabels[data.status]}</Text>
          </PressableScale>
          <PressableScale
            onPress={() => {}}
            style={[styles.badge, { backgroundColor: priorityColor(data.priority) }]}
            pressedStyle={{ opacity: 0.85 }}
          >
            <Text style={styles.badgeText}>{priorityLabels[data.priority]}</Text>
          </PressableScale>
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
  wrapper: { marginBottom: 16, marginHorizontal: 16 },
  card: {
    borderRadius: 20,
    marginTop: 16,
    padding: 16,
    paddingTop: 10,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  menuWrap: { position: 'absolute', top: 10, right: 10, zIndex: 2 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  headerTextBlock: { marginBottom: 12, paddingRight: 56 },
  title: { color: '#fff', fontWeight: '800', fontSize: 20, letterSpacing: 0.2 },
  deptRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  deptChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  deptChipPressed: { backgroundColor: 'rgba(255,255,255,0.25)' },
  deptText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  deadlineWrap: { marginBottom: 12 },
  progressContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBar: { height: '100%' },
  deadlineDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  date: { fontSize: 12, color: 'rgba(255,255,255,0.95)' },
  deadlineOverdue: { color: '#F43F5E' },

  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  number: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

export {};
