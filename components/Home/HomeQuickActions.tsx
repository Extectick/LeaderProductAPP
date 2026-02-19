import { withOpacity, servicesTokens } from '@/src/features/services/ui/servicesTokens';
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

const isWeb = Platform.OS === 'web';

export default function HomeQuickActions({ actions, columns }: Props) {
  const reduceMotion = useReducedMotion();
  const visibleActions = actions.filter((item) => !item.hidden);
  const basis = columns === 4 ? '24%' : '48.5%';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Быстрые действия</Text>
      <View style={styles.grid}>
        {visibleActions.map((action, index) => {
          const enabled = action.enabled !== false;
          const [c1, c2] = action.gradient;
          return (
            <Animated.View
              key={action.id}
              entering={
                reduceMotion
                  ? undefined
                  : FadeInUp
                      .delay(80 + index * servicesTokens.motion.enterDelayStepMs)
                      .duration(servicesTokens.motion.enterDurationMs)
              }
              style={[styles.itemWrap, { flexBasis: basis }]}
            >
              <Pressable
                onPress={enabled ? action.onPress : undefined}
                accessibilityRole="button"
                accessibilityLabel={enabled ? action.title : `${action.title} недоступно`}
                disabled={!enabled}
                style={(state: any) => [
                  styles.card,
                  {
                    borderColor: enabled ? '#D5E0F1' : servicesTokens.states.disabledBorder,
                    backgroundColor: enabled ? '#FFFFFF' : servicesTokens.states.disabledBackground,
                    opacity: enabled ? 1 : servicesTokens.states.disabledOpacity,
                  },
                  state.hovered && enabled && isWeb ? styles.cardHovered : null,
                  state.pressed && enabled ? styles.cardPressed : null,
                ]}
              >
                <View style={[styles.decor, { backgroundColor: withOpacity(c1, enabled ? 0.18 : 0.08) }]} />

                <View style={styles.iconWrap}>
                  <View style={[styles.iconBubble, { backgroundColor: withOpacity(c1, enabled ? 0.9 : 0.35) }]}>
                    <Ionicons name={action.icon as any} size={servicesTokens.quick.iconSize} color="#FFFFFF" />
                  </View>
                  {action.serviceKind === 'CLOUD' ? (
                    <View style={styles.cloudIconBadge}>
                      <Ionicons name="cloud-outline" size={10} color="#1E3A8A" />
                    </View>
                  ) : null}
                </View>

                <Text style={[styles.cardTitle, !enabled ? styles.cardTitleDisabled : null]} numberOfLines={1}>
                  {action.title}
                </Text>
                <Text numberOfLines={2} style={[styles.cardDescription, !enabled ? styles.cardDescriptionDisabled : null]}>
                  {action.description}
                </Text>

                {action.statusLabel ? (
                  <View style={[styles.statusBadge, !enabled ? styles.statusBadgeDisabled : null]}>
                    <Text style={[styles.statusBadgeText, !enabled ? styles.statusBadgeTextDisabled : null]}>
                      {action.statusLabel}
                    </Text>
                  </View>
                ) : null}

                {!enabled ? (
                  <View style={styles.lockOverlay}>
                    <Ionicons name="lock-closed-outline" size={14} color="#475569" />
                  </View>
                ) : null}
              </Pressable>
            </Animated.View>
          );
        })}
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
    minWidth: 122,
  },
  card: {
    minHeight: servicesTokens.quick.cardMinHeight,
    borderRadius: servicesTokens.quick.cardRadius,
    borderWidth: 1,
    overflow: 'hidden',
    padding: servicesTokens.quick.cardPadding,
    gap: 7,
    shadowColor: servicesTokens.card.shadowColor,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    ...(Platform.OS === 'android' ? { elevation: 2 } : null),
  },
  cardHovered: {
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    ...(Platform.OS === 'android' ? { elevation: 4 } : null),
  },
  cardPressed: {
    transform: [{ scale: servicesTokens.motion.pressScale }],
  },
  decor: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 128,
    height: 96,
    borderRadius: 999,
  },
  iconWrap: {
    position: 'relative',
    width: servicesTokens.quick.iconWrapSize,
    height: servicesTokens.quick.iconWrapSize,
  },
  iconBubble: {
    width: servicesTokens.quick.iconWrapSize,
    height: servicesTokens.quick.iconWrapSize,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOpacity: 0.2,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    ...(Platform.OS === 'android' ? { elevation: 2 } : null),
  },
  cloudIconBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: servicesTokens.quick.cloudSize,
    height: servicesTokens.quick.cloudSize,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EEF2FF',
  },
  cardTitle: {
    fontSize: 15,
    color: '#162235',
    fontWeight: '800',
  },
  cardTitleDisabled: {
    color: servicesTokens.states.disabledText,
  },
  cardDescription: {
    fontSize: 12,
    color: '#5F7088',
    lineHeight: 16,
    fontWeight: '500',
  },
  cardDescriptionDisabled: {
    color: '#7E8EA6',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#E0EEFF',
    borderWidth: 1,
    borderColor: '#B7D3FF',
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
  statusBadgeTextDisabled: {
    color: '#475569',
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
