import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AnimatedRe, { FadeInDown } from 'react-native-reanimated';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import Dropdown, { DropdownItem } from '@/components/ui/Dropdown';
import AppealStatusMenu from './AppealStatusMenu';
import { AppealDetail, AppealStatus, AppealPriority } from '@/types/appealsTypes';
import {
  getAppealMuteStatus,
  muteAppeal,
  unmuteAppeal,
} from '@/utils/notificationSettingsService';

type Props = {
  data: AppealDetail;
  title?: string;
  onChangeStatus?: (s: AppealStatus) => void;
  onAssign?: () => void;
  onClaim?: () => void;
  onTransfer?: () => void;
  onEditDeadline?: () => void;
  canAssign?: boolean;
  canClaim?: boolean;
  canTransfer?: boolean;
  canEditDeadline?: boolean;
  allowedStatuses?: AppealStatus[];
};

const statusLabels: Record<AppealStatus, string> = {
  OPEN: 'Открыто',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершено',
  DECLINED: 'Отклонено',
  RESOLVED: 'Ожидание подтверждения',
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
  onClaim,
  onTransfer,
  onEditDeadline,
  canAssign,
  canClaim,
  canTransfer,
  canEditDeadline,
  allowedStatuses,
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
    return Math.max(0, Math.min(current / total, 1));
  }, [data.createdAt, data.deadline]);

  const isOverdue = progress !== null && progress >= 1;

  const [statusMenuVisible, setStatusMenuVisible] = useState(false);
  const [muted, setMuted]   = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);

  useEffect(() => {
    void getAppealMuteStatus(data.id).then(setMuted);
  }, [data.id]);

  const toggleMute = async () => {
    if (muteLoading) return;
    const next = !muted;
    setMuted(next);
    setMuteLoading(true);
    try {
      next ? await muteAppeal(data.id) : await unmuteAppeal(data.id);
    } catch {
      setMuted(!next);
    } finally {
      setMuteLoading(false);
    }
  };

  const actionItems: DropdownItem<'status' | 'assign' | 'claim' | 'transfer' | 'deadline'>[] = [
    ...(allowedStatuses && allowedStatuses.length && onChangeStatus
      ? [{ label: 'Изменить статус', value: 'status' as const }]
      : []),
    ...(canEditDeadline && onEditDeadline ? [{ label: 'Изменить дедлайн', value: 'deadline' as const }] : []),
    ...(canClaim && onClaim ? [{ label: 'Взять в работу', value: 'claim' as const }] : []),
    ...(canAssign && onAssign ? [{ label: 'Назначить', value: 'assign' as const }] : []),
    ...(canTransfer && onTransfer ? [{ label: 'Передать в отдел', value: 'transfer' as const }] : []),
  ];

  const handleAction = (action: 'status' | 'assign' | 'claim' | 'transfer' | 'deadline') => {
    switch (action) {
      case 'status':
        setStatusMenuVisible(true);
        break;
      case 'deadline':
        onEditDeadline?.();
        break;
      case 'assign':
        onAssign?.();
        break;
      case 'claim':
        onClaim?.();
        break;
      case 'transfer':
        onTransfer?.();
        break;
    }
  };

  const handleSelectStatus = (s: AppealStatus) => {
    setStatusMenuVisible(false);
    onChangeStatus?.(s);
  };
  const canOpenStatusMenu = !!(allowedStatuses && allowedStatuses.length && onChangeStatus);

  return (
    <AnimatedRe.View entering={FadeInDown.duration(250)} style={styles.wrapper}>
      <LinearGradient
        colors={['#2D8CFF', '#4F6EF7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Кнопка mute/unmute уведомлений */}
        <Pressable onPress={() => void toggleMute()} style={styles.muteBtn} disabled={muteLoading}>
          <Ionicons
            name={muted ? 'notifications-off-outline' : 'notifications-outline'}
            size={16}
            color={muted ? 'rgba(255,255,255,0.5)' : '#fff'}
          />
        </Pressable>

        {actionItems.length ? (
          <Dropdown
            items={actionItems}
            onChange={handleAction}
            placeholder=""
            style={styles.menuWrap}
            buttonStyle={styles.iconBtn}
            renderTrigger={() => <Ionicons name="ellipsis-horizontal" size={16} color="#fff" />}
          />
        ) : null}

        <View style={styles.topRow}>
          <Text numberOfLines={1} style={styles.title}>
            #{data.number} {displayTitle}
          </Text>
        </View>

        <View style={styles.badgesRow}>
          <PressableScale
            onPress={canOpenStatusMenu ? () => setStatusMenuVisible(true) : undefined}
            style={[styles.badge, styles.badgeCompact, { backgroundColor: statusColor(data.status) }]}
            pressedStyle={{ opacity: 0.85 }}
          >
            <Text style={styles.badgeText}>{statusLabels[data.status]}</Text>
          </PressableScale>
          <PressableScale
            onPress={() => {}}
            style={[styles.badge, styles.badgeCompact, { backgroundColor: priorityColor(data.priority) }]}
            pressedStyle={{ opacity: 0.85 }}
          >
            <Text style={styles.badgeText}>{priorityLabels[data.priority]}</Text>
          </PressableScale>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.deptRow}>
            <PressableScale style={styles.deptChip} pressedStyle={styles.deptChipPressed}>
              <Text style={styles.deptText}>{fromDept}</Text>
            </PressableScale>
            <Ionicons name="chevron-forward" size={12} color="#fff" style={{ marginHorizontal: 4 }} />
            <PressableScale style={styles.deptChip} pressedStyle={styles.deptChipPressed}>
              <Text style={styles.deptText}>{toDept}</Text>
            </PressableScale>
          </View>
          <Text numberOfLines={1} style={[styles.date, isOverdue && styles.deadlineOverdue]}>
            {formattedDeadline ? `Дедлайн: ${formattedDeadline}` : `Создано: ${createdAt}`}
          </Text>
        </View>

        {progress !== null ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(progress * 100)}%`,
                  backgroundColor: isOverdue ? '#F43F5E' : '#FFFFFF',
                },
              ]}
            />
          </View>
        ) : null}
      </LinearGradient>

      <AppealStatusMenu
        visible={statusMenuVisible}
        current={data.status}
        allowed={allowedStatuses}
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
    case 'COMPLETED':
      return '#2DD4BF';
    case 'DECLINED':
      return '#F97316';
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
  wrapper: { marginBottom: 10, marginHorizontal: 0 },
  card: {
    borderRadius: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 80,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#2563EB',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  muteBtn: {
    position: 'absolute',
    top: 8,
    right: 46,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuWrap: { position: 'absolute', top: 8, right: 8, zIndex: 2 },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  topRow: {
    paddingRight: 8,
  },
  title: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.05, paddingRight: 2 },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  metaRow: {
    marginTop: 6,
    alignItems: 'flex-start',
    gap: 6,
  },
  deptRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, flexWrap: 'wrap' },
  deptChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  deptChipPressed: { backgroundColor: 'rgba(255,255,255,0.25)' },
  deptText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  date: { fontSize: 10, color: 'rgba(255,255,255,0.95)', flexShrink: 1, maxWidth: '100%' },
  deadlineOverdue: { color: '#F43F5E' },
  progressTrack: {
    marginTop: 6,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeCompact: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 7 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});

export {};
