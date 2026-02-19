import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';

export type HomeQuickAction = {
  id: string;
  title: string;
  description: string;
  icon: string;
  gradient: readonly [string, string];
  onPress?: () => void;
  enabled?: boolean;
  hidden?: boolean;
  statusLabel?: string;
  serviceKind?: 'LOCAL' | 'CLOUD';
};

type Props = {
  actions: HomeQuickAction[];
  columns: 2 | 4;
};

export default function HomeQuickActions({ actions, columns }: Props) {
  const reducedMotion = useReducedMotion();
  const basis = columns === 4 ? '24%' : '48%';
  const visibleActions = actions.filter((item) => !item.hidden);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Быстрые действия</Text>
      <View style={styles.grid}>
        {visibleActions.map((action, index) => {
          const enabled = action.enabled !== false;
          return (
          <Animated.View
            entering={reducedMotion ? undefined : FadeInUp.delay(80 + index * 35).duration(360)}
            key={action.id}
            style={[styles.itemWrap, { flexBasis: basis }]}
          >
            <Pressable
              onPress={enabled ? action.onPress : undefined}
              style={(state: any) => [
                styles.card,
                state.hovered ? styles.hovered : null,
                state.pressed && enabled ? styles.pressed : null,
                !enabled ? styles.disabledCard : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={enabled ? action.title : `${action.title} недоступно`}
              disabled={!enabled}
            >
              <View style={[styles.accentLine, { backgroundColor: enabled ? '#94A3B8' : '#CBD5E1' }]} />
              <View style={styles.iconWrap}>
                <Ionicons name={action.icon as any} size={18} color={enabled ? '#334155' : '#94A3B8'} />
                {action.serviceKind === 'CLOUD' ? (
                  <View style={styles.cloudIconBadge}>
                    <Ionicons name="cloud-outline" size={10} color="#1E3A8A" />
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardTitle}>{action.title}</Text>
              <Text numberOfLines={2} style={styles.cardDescription}>
                {action.description}
              </Text>
              {action.statusLabel ? (
                <View style={[styles.statusBadge, !enabled ? styles.statusBadgeDisabled : null]}>
                  <Text style={styles.statusBadgeText}>{action.statusLabel}</Text>
                </View>
              ) : null}
              {!enabled ? (
                <View style={styles.lockOverlay}>
                  <Ionicons name="lock-closed-outline" size={15} color="#334155" />
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        )})}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  itemWrap: {
    minWidth: 120,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    minHeight: 114,
    overflow: 'hidden',
    padding: 12,
    gap: 7,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    ...(Platform.OS === 'android' ? { elevation: 2 } : null),
  },
  hovered: {
    borderColor: '#94A3B8',
    backgroundColor: '#F8FAFC',
    transform: [{ translateY: -1 }],
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    ...(Platform.OS === 'android' ? { elevation: 4 } : null),
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.96,
  },
  disabledCard: {
    opacity: 0.74,
    borderColor: '#94A3B8',
    backgroundColor: '#F8FAFC',
  },
  accentLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  iconWrap: {
    position: 'relative',
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F7',
    borderWidth: 1,
    borderColor: '#D7DEE8',
  },
  cardTitle: {
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '800',
  },
  cardDescription: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  cloudIconBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 16,
    height: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  statusBadgeDisabled: {
    backgroundColor: '#E2E8F0',
    borderColor: '#CBD5E1',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  lockOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#FFFFFFCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
