import React, { useEffect, useMemo, useRef } from 'react';
import {
  Alert,
  Animated,
  Image,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppealListItem, AppealRoleBadge, Scope } from '@/types/appealsTypes';

type Props = {
  item: AppealListItem;
  currentUserId?: number;
  listContext?: Scope;
};

const statusLabel: Record<string, string> = {
  OPEN: 'Открыто',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершено',
  DECLINED: 'Отклонено',
  RESOLVED: 'Ожидание',
};

const priorityLabel: Record<string, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  CRITICAL: 'Критический',
};

function getStatusColor(status: string) {
  switch (status) {
    case 'OPEN':
      return '#16A34A';
    case 'IN_PROGRESS':
      return '#2563EB';
    case 'RESOLVED':
      return '#A855F7';
    case 'COMPLETED':
      return '#0EA5A4';
    case 'DECLINED':
      return '#F97316';
    default:
      return '#6B7280';
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'LOW':
      return '#65A30D';
    case 'MEDIUM':
      return '#D97706';
    case 'HIGH':
      return '#EA580C';
    case 'CRITICAL':
      return '#DC2626';
    default:
      return '#6B7280';
  }
}

function getUserLabel(item: AppealListItem) {
  const sender = item.lastMessage?.sender;
  const fullName = [sender?.firstName, sender?.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (sender?.email) return sender.email;
  return 'Система';
}

function getInitials(item: AppealListItem) {
  const sender = item.lastMessage?.sender;
  const initials = `${sender?.firstName?.[0] || ''}${sender?.lastName?.[0] || ''}`.toUpperCase();
  if (initials) return initials;
  if (sender?.email) return sender.email[0]!.toUpperCase();
  return 'S';
}

function getBadgeMeta(badge: AppealRoleBadge) {
  if (badge === 'OWN_APPEAL') {
    return {
      label: 'Моё обращение',
      icon: 'person-circle-outline' as const,
      color: '#0369A1',
      bg: '#E0F2FE',
    };
  }
  return {
    label: 'Я исполнитель',
    icon: 'checkmark-done-circle-outline' as const,
    color: '#065F46',
    bg: '#DCFCE7',
  };
}

function AppealListItemForm({ item, currentUserId, listContext = 'my' }: Props) {
  const router = useRouter();
  const mountAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(mountAnim, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [mountAnim]);

  const last = item.lastMessage;
  const unread = item.unreadCount ?? 0;
  const statusColor = getStatusColor(item.status);
  const priorityColor = getPriorityColor(item.priority);
  const senderName = useMemo(() => getUserLabel(item), [item]);
  const senderDept = item.lastMessage?.sender?.department?.name || item.toDepartment?.name || '';
  const initials = useMemo(() => getInitials(item), [item]);
  const snippet = last?.text || (last?.attachments?.length ? '[Вложение]' : 'Без сообщений');
  const timeLabel = last?.createdAt ? dayjs(last.createdAt).format('HH:mm') : '';
  const isOwnAppeal = !!currentUserId && item.createdById === currentUserId;
  const isAssignee = !!currentUserId && (item.assignees || []).some((a) => a.user?.id === currentUserId);

  const roleBadges = useMemo(() => {
    if (listContext !== 'department') return [] as AppealRoleBadge[];
    const badges: AppealRoleBadge[] = [];
    if (isOwnAppeal) badges.push('OWN_APPEAL');
    if (isAssignee) badges.push('ASSIGNEE');
    return badges;
  }, [isAssignee, isOwnAppeal, listContext]);

  const animatedCardStyle = {
    opacity: mountAnim,
    transform: [
      {
        translateY: mountAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0],
        }),
      },
      { scale: pressAnim },
    ],
  };

  const onPressIn = () =>
    Animated.timing(pressAnim, {
      toValue: 0.985,
      duration: 90,
      useNativeDriver: true,
    }).start();
  const onPressOut = () =>
    Animated.timing(pressAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/(main)/services/appeals/[id]', params: { id: String(item.id) } })
      }
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={{ paddingHorizontal: 10, paddingVertical: 6 }}
    >
      <Animated.View
        style={[
          {
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            backgroundColor: '#FFFFFF',
            overflow: 'hidden',
            shadowColor: '#0F172A',
            shadowOpacity: 0.06,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
          },
          animatedCardStyle,
        ]}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: statusColor,
          }}
        />

        <LinearGradient
          colors={['#F8FAFC', '#EEF2FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', flex: 1 }} numberOfLines={1}>
              #{item.number} {item.title ?? 'Без названия'}
            </Text>
            {unread > 0 ? (
              <View
                style={{
                  minWidth: 24,
                  height: 24,
                  paddingHorizontal: 7,
                  borderRadius: 12,
                  backgroundColor: '#2563EB',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>{unread}</Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: '#F8FAFC',
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 8, backgroundColor: statusColor }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#0F172A' }}>
                {statusLabel[item.status] ?? item.status}
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: '#F8FAFC',
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 8, backgroundColor: priorityColor }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#0F172A' }}>
                {priorityLabel[item.priority] ?? item.priority}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: '#F1F5F9',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155' }} numberOfLines={1}>
                {item.toDepartment?.name}
              </Text>
            </View>

            {roleBadges.map((badge) => {
              const meta = getBadgeMeta(badge);
              const webTitleProps = Platform.OS === 'web' ? ({ title: meta.label } as any) : {};
              return (
                <Pressable
                  key={badge}
                  onLongPress={() => {
                    if (Platform.OS !== 'web') Alert.alert(meta.label);
                  }}
                  accessibilityLabel={meta.label}
                  accessibilityHint="Маркер роли в обращении"
                  {...webTitleProps}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: meta.bg,
                  }}
                >
                  <Ionicons name={meta.icon} size={16} color={meta.color} />
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: '#E2E8F0',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.lastMessage?.sender?.avatarUrl ? (
                <Image
                  source={{ uri: item.lastMessage.sender.avatarUrl }}
                  style={{ width: 28, height: 28 }}
                />
              ) : (
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#334155' }}>{initials}</Text>
              )}
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>
                  {senderName}
                </Text>
                {!!senderDept ? (
                  <>
                    <Ionicons name="ellipse" size={4} color="#94A3B8" />
                    <Text style={{ fontSize: 11, color: '#64748B' }} numberOfLines={1}>
                      {senderDept}
                    </Text>
                  </>
                ) : null}
              </View>
              <Text style={{ color: '#334155', fontSize: 13 }} numberOfLines={1}>
                {snippet}
              </Text>
            </View>

            <Text
              style={{
                minWidth: 44,
                textAlign: 'right',
                fontSize: 12,
                color: '#64748B',
                fontVariant: ['tabular-nums'],
              }}
            >
              {timeLabel}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default React.memo(AppealListItemForm);
