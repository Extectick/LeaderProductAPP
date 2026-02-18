import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';

import { SkeletonBlock } from '@/components/Home/HomeSkeleton';
import type { HomeActivityItem, HomeMetricState } from '@/types/homeDashboardTypes';

type Props = {
  items: HomeActivityItem[];
  state: HomeMetricState;
  message?: string;
  onOpenItem: (item: HomeActivityItem) => void;
  maxListHeight?: number;
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Открыто',
  IN_PROGRESS: 'В работе',
  RESOLVED: 'Ожидание подтверждения',
  COMPLETED: 'Завершено',
  DECLINED: 'Отклонено',
};

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(+date)) return 'только что';
  const diff = Date.now() - +date;
  if (diff < 60_000) return 'только что';
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} мин назад`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} ч назад`;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDeadline(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(+date)) return 'не указан';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function HomeActivityFeed({ items, state, message, onOpenItem, maxListHeight = 420 }: Props) {
  const reducedMotion = useReducedMotion();
  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInUp.delay(170).duration(420)}
    >
      <Pressable style={(state: any) => [styles.card, state.hovered ? styles.cardHovered : null]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="sparkles-outline" size={17} color="#0EA5E9" />
          <Text style={styles.title}>Лента активности</Text>
        </View>
        <Text style={styles.caption}>Последние обновления обращений</Text>
      </View>

      {state === 'loading' ? (
        <View style={{ gap: 10 }}>
          <SkeletonBlock height={66} radius={12} />
          <SkeletonBlock height={66} radius={12} />
          <SkeletonBlock height={66} radius={12} />
        </View>
      ) : null}

      {state === 'locked' ? (
        <View style={styles.stateWrap}>
          <Ionicons name="lock-closed-outline" size={16} color="#64748B" />
          <Text style={styles.stateText}>{message || 'Недостаточно прав для просмотра активности'}</Text>
        </View>
      ) : null}

      {state === 'error' ? (
        <View style={styles.stateWrap}>
          <Ionicons name="warning-outline" size={16} color="#B91C1C" />
          <Text style={[styles.stateText, { color: '#B91C1C' }]}>{message || 'Не удалось загрузить активность'}</Text>
        </View>
      ) : null}

      {state === 'ready' ? (
        items.length ? (
          <ScrollView
            style={{ maxHeight: maxListHeight }}
            contentContainerStyle={styles.list}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => onOpenItem(item)}
                style={(state: any) => [
                  styles.item,
                  state.hovered ? styles.itemHovered : null,
                  state.pressed ? styles.itemPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Открыть ${item.title}`}
              >
                <View style={styles.itemTop}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      #{item.number} {item.title}
                    </Text>
                    <Text style={styles.metaTextMuted}>{formatRelativeDate(item.updatedAt)}</Text>
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>{STATUS_LABELS[item.status] || item.status}</Text>
                  </View>
                </View>

                <Text numberOfLines={2} style={styles.itemSubtitle}>
                  {item.messagePreview || item.subtitle}
                </Text>

                <View style={styles.metaChips}>
                  <View style={[styles.chip, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }]}>
                    <Text style={[styles.chipText, { color: '#1E40AF' }]}>
                      {item.priority.toLowerCase()}
                    </Text>
                  </View>
                  {item.departmentName ? (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>{item.departmentName}</Text>
                    </View>
                  ) : null}
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>Исполнители: {item.assigneeCount}</Text>
                  </View>
                  {item.unreadCount > 0 ? (
                    <View style={[styles.chip, { borderColor: '#86EFAC', backgroundColor: '#ECFDF5' }]}>
                      <Text style={[styles.chipText, { color: '#047857' }]}>
                        Непрочитано: {item.unreadCount}
                      </Text>
                    </View>
                  ) : null}
                  {item.deadline ? (
                    <View style={[styles.chip, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}>
                      <Text style={[styles.chipText, { color: '#B91C1C' }]}>
                        Дедлайн: {formatDeadline(item.deadline)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.footerRow}>
                  <Text style={styles.metaTextMuted}>
                    {item.lastSenderName ? `Последний ответ: ${item.lastSenderName}` : 'Последний ответ не указан'}
                  </Text>
                  <Ionicons name="chevron-forward-outline" size={16} color="#94A3B8" />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.emptyText}>Пока нет активности по обращениям</Text>
        )
      ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    ...(Platform.OS === 'android' ? { elevation: 3 } : null),
  },
  cardHovered: {
    borderColor: '#93C5FD',
    transform: [{ translateY: -1 }],
    shadowOpacity: 0.11,
    shadowRadius: 14,
    ...(Platform.OS === 'android' ? { elevation: 6 } : null),
  },
  header: {
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  title: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  caption: {
    color: '#64748B',
    fontSize: 12,
  },
  list: {
    gap: 8,
  },
  item: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    gap: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    ...(Platform.OS === 'android' ? { elevation: 1 } : null),
  },
  itemHovered: {
    borderColor: '#60A5FA',
    backgroundColor: '#F8FBFF',
    transform: [{ translateY: -1 }],
    shadowOpacity: 0.08,
    shadowRadius: 12,
    ...(Platform.OS === 'android' ? { elevation: 4 } : null),
  },
  itemPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.9,
  },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  itemTitle: {
    flex: 1,
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 14,
  },
  itemSubtitle: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
  },
  metaChips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  metaTextMuted: {
    flex: 1,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  statusPill: {
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    color: '#3730A3',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
  },
  stateWrap: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stateText: {
    flex: 1,
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
});
