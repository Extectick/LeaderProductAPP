import { Pressable, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { AppealListItem } from '@/types/appealsTypes';
import dayjs from 'dayjs';

export default function AppealListItemForm({ item, currentUserId }: { item: AppealListItem; currentUserId?: number }) {
  const router = useRouter();
  const last = item.lastMessage;
  const unread = item.unreadCount ?? 0;
  const unreadOther = unread; // бэкенд уже не считает свои сообщения, выводим как есть
  const snippet = last?.text || (last?.attachments?.length ? '[Вложение]' : '');
  const timeLabel = last?.createdAt ? new Date(last.createdAt).toLocaleTimeString() : '';
  const isMine = !!currentUserId && item.createdById === currentUserId;

  // Прогресс по дедлайну
  const deadline = item.deadline ? dayjs(item.deadline) : null;
  const created = item.createdAt ? dayjs(item.createdAt) : null;
  let progressPct = null as number | null;
  if (deadline && created) {
    const total = deadline.diff(created);
    const spent = dayjs().diff(created);
    if (total > 0) progressPct = Math.min(100, Math.max(0, (spent / total) * 100));
    else progressPct = 100;
  }
  const progressColor =
    progressPct === null
      ? '#E5E7EB'
      : progressPct < 50
      ? '#10B981'
      : progressPct < 80
      ? '#F59E0B'
      : '#EF4444';

  const statusLabel: Record<string, string> = {
    OPEN: 'Открыто',
    IN_PROGRESS: 'В работе',
    COMPLETED: 'Завершено',
    DECLINED: 'Отклонено',
    RESOLVED: 'Ожидание подтверждения',
  };
  const statusColor = (() => {
    switch (item.status) {
      case 'OPEN': return '#4CAF50';
      case 'IN_PROGRESS': return '#2196F3';
      case 'RESOLVED': return '#9C27B0';
      case 'COMPLETED': return '#2DD4BF';
      case 'DECLINED': return '#F97316';
      default: return '#6B7280';
    }
  })();

  const priorityLabel: Record<string, string> = {
    LOW: 'Низкий',
    MEDIUM: 'Средний',
    HIGH: 'Высокий',
    CRITICAL: 'Критический',
  };
  const priorityColor = (() => {
    switch (item.priority) {
      case 'LOW': return '#8BC34A';
      case 'MEDIUM': return '#FFC107';
      case 'HIGH': return '#FF5722';
      case 'CRITICAL': return '#F43F5E';
      default: return '#6B7280';
    }
  })();

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/(main)/services/appeals/[id]', params: { id: String(item.id) } })
      }
    >
      <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee', gap: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontWeight: '600', flex: 1 }}>
            #{item.number} {item.title ?? 'Без названия'}
          </Text>
        {unreadOther > 0 ? (
            <View
              style={{
                minWidth: 26,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
                backgroundColor: '#2563EB',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>{unreadOther}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F9FAFB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
            <Text style={{ fontWeight: '600', color: '#111827', fontSize: 12 }}>{statusLabel[item.status] ?? item.status}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F9FAFB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: priorityColor }} />
            <Text style={{ fontWeight: '600', color: '#111827', fontSize: 12 }}>{priorityLabel[item.priority] ?? item.priority}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ fontWeight: '600', color: '#111827', fontSize: 12 }}>{item.toDepartment.name}</Text>
          </View>
          {isMine ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ fontWeight: '700', color: '#1D4ED8', fontSize: 12 }}>Моё</Text>
            </View>
          ) : null}
        </View>
        {last ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{timeLabel}</Text>
            <Text numberOfLines={1} style={{ flex: 1, color: '#111827' }}>
              {snippet}
            </Text>
          </View>
        ) : null}
        {progressPct !== null ? (
          <View style={{ marginTop: 4, height: 4, backgroundColor: '#E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
            <View style={{ width: `${progressPct}%`, backgroundColor: progressColor, height: '100%' }} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
