import { withOpacity, servicesTokens } from '@/src/features/services/ui/servicesTokens';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { ServiceKind } from '@/utils/servicesService';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  FadeInDown,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  icon: string;
  name: string;
  size: number;
  onPress: () => void;
  description?: string;
  gradient?: [string, string];
  backgroundColor?: string;
  textColor?: string;
  iconSize?: number;
  disableShadow?: boolean;
  disableScaleOnPress?: boolean;
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  kind?: ServiceKind;
  enterIndex?: number;
}

const isWeb = Platform.OS === 'web';

export default function ServiceCard({
  icon,
  name,
  size,
  onPress,
  description,
  gradient,
  backgroundColor,
  textColor,
  iconSize = 36,
  disableShadow = false,
  disableScaleOnPress = false,
  containerStyle,
  textStyle,
  disabled = false,
  kind = 'CLOUD',
  enterIndex = 0,
}: Props) {
  const reduceMotion = useReducedMotion();
  const themeCardBg = useThemeColor({}, 'cardBackground');
  const themeText = useThemeColor({}, 'text');
  const themeBorder = useThemeColor({}, 'inputBorder' as any);
  const themeSecondary = useThemeColor({}, 'secondaryText' as any);
  const cardBg = backgroundColor ?? (containerStyle as ViewStyle | undefined)?.backgroundColor ?? themeCardBg;
  const textPrimary = textColor ?? themeText;

  const [accentStart, accentEnd] = useMemo<[string, string]>(() => {
    if (gradient?.length === 2) return gradient;
    return ['#2563EB', '#1D4ED8'];
  }, [gradient]);

  const scale = useSharedValue(1);
  const hover = useSharedValue(0);

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const lift = hover.value * servicesTokens.motion.hoverLiftPx;
    return {
      transform: [{ scale: scale.value }, { translateY: -lift }],
      shadowOpacity: disableShadow ? 0 : servicesTokens.card.shadowOpacity + hover.value * 0.08,
      shadowRadius: disableShadow ? 0 : servicesTokens.card.shadowRadius + hover.value * 5,
      elevation: disableShadow ? 0 : 3 + hover.value * 2,
    };
  });

  const handleHoverIn = () => {
    if (!isWeb || disabled) return;
    hover.value = withTiming(1, {
      duration: servicesTokens.motion.hoverDurationMs,
      easing: Easing.out(Easing.quad),
    });
    if (!disableScaleOnPress) {
      scale.value = withTiming(1.01, { duration: servicesTokens.motion.hoverDurationMs });
    }
  };

  const handleHoverOut = () => {
    if (!isWeb) return;
    hover.value = withTiming(0, {
      duration: servicesTokens.motion.hoverDurationMs,
      easing: Easing.out(Easing.quad),
    });
    if (!disableScaleOnPress) {
      scale.value = withTiming(1, { duration: servicesTokens.motion.hoverDurationMs });
    }
  };

  const handlePressIn = () => {
    if (disabled || disableScaleOnPress) return;
    scale.value = withTiming(servicesTokens.motion.pressScale, { duration: servicesTokens.motion.pressDurationMs });
  };

  const handlePressOut = () => {
    if (disabled || disableScaleOnPress) return;
    scale.value = withTiming(1, { duration: servicesTokens.motion.pressDurationMs });
  };

  const cardRadius = (StyleSheet.flatten(containerStyle)?.borderRadius as number) || servicesTokens.card.radius;
  const iconContainerSize = Math.min(
    servicesTokens.card.iconContainerMaxSize,
    Math.max(servicesTokens.card.iconContainerMinSize, Math.floor(size * servicesTokens.card.iconContainerSizeRatio))
  );

  return (
    <Animated.View
      entering={
        reduceMotion
          ? undefined
          : FadeInDown
              .delay(enterIndex * servicesTokens.motion.enterDelayStepMs)
              .duration(servicesTokens.motion.enterDurationMs)
      }
      style={[
        {
          width: size,
          minHeight: Math.floor(size * servicesTokens.card.minHeightRatio),
          borderRadius: cardRadius,
          overflow: 'hidden',
          shadowColor: servicesTokens.card.shadowColor,
          shadowOffset: {
            width: servicesTokens.card.shadowOffsetX,
            height: servicesTokens.card.shadowOffsetY,
          },
        },
        containerStyle,
        cardAnimatedStyle,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        disabled={disabled}
        onPress={() => !disabled && onPress()}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...(isWeb ? { onHoverIn: handleHoverIn, onHoverOut: handleHoverOut } : {})}
        android_ripple={{ color: '#DFE9FA' }}
        style={({ pressed }) => [
          styles.card,
          {
            borderRadius: cardRadius,
            borderColor: disabled ? servicesTokens.states.disabledBorder : themeBorder || servicesTokens.card.borderColor,
            borderWidth: servicesTokens.card.borderWidth,
            backgroundColor: disabled ? servicesTokens.states.disabledBackground : cardBg || servicesTokens.card.background,
            opacity: disabled ? servicesTokens.states.disabledOpacity : 1,
          },
          pressed && Platform.OS === 'ios' ? styles.cardPressedIos : null,
        ]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[withOpacity(accentStart, 0.2), withOpacity(accentEnd, 0.1), 'transparent']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={styles.softDecor}
        />

        <View style={styles.content}>
          <View style={styles.iconRow}>
            <View
              style={[
                styles.iconShell,
                {
                  width: iconContainerSize,
                  height: iconContainerSize,
                  borderRadius: iconContainerSize / 2,
                },
              ]}
            >
              <LinearGradient
                colors={[accentStart, accentEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.iconGradient,
                  {
                    width: iconContainerSize,
                    height: iconContainerSize,
                    borderRadius: iconContainerSize / 2,
                  },
                ]}
              >
                <Ionicons name={icon as any} size={iconSize} color="#FFFFFF" />
              </LinearGradient>
              {kind === 'CLOUD' ? (
                <View style={styles.cloudBadge}>
                  <Ionicons name="cloud-outline" size={servicesTokens.card.cloudDotIconSize} color="#1E40AF" />
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.textWrap}>
            <Text numberOfLines={2} style={[styles.title, { color: disabled ? servicesTokens.states.disabledText : textPrimary }, textStyle]}>
              {name}
            </Text>
            {description ? (
              <Text numberOfLines={3} style={[styles.description, { color: disabled ? '#7A8BA3' : themeSecondary || '#475569' }]}>
                {description}
              </Text>
            ) : null}
          </View>

          {disabled ? (
            <View style={styles.disabledBadge}>
              <Ionicons name="lock-closed-outline" size={13} color="#B91C1C" />
              <Text style={styles.disabledBadgeText}>Недоступно</Text>
            </View>
          ) : (
            <View style={[styles.cta, { backgroundColor: withOpacity(accentStart, 0.12), borderColor: withOpacity(accentStart, 0.2) }]}>
              <Ionicons name="sparkles-outline" size={13} color={accentStart} />
              <Text style={[styles.ctaText, { color: accentStart }]}>Открыть</Text>
              <Ionicons name="arrow-forward" size={13} color={accentStart} />
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingHorizontal: servicesTokens.card.paddingHorizontal,
    paddingVertical: servicesTokens.card.paddingVertical,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cardPressedIos: {
    opacity: 0.95,
  },
  softDecor: {
    position: 'absolute',
    top: -22,
    right: -30,
    width: 210,
    height: 165,
    borderRadius: 999,
  },
  content: {
    flex: 1,
    gap: 11,
  },
  iconRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  iconShell: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cloudBadge: {
    position: 'absolute',
    right: -4,
    bottom: -3,
    width: servicesTokens.card.cloudDotSize,
    height: servicesTokens.card.cloudDotSize,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    gap: 5,
  },
  title: {
    fontSize: servicesTokens.card.titleSize,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  description: {
    fontSize: servicesTokens.card.descSize,
    lineHeight: 17,
    fontWeight: '500',
  },
  cta: {
    alignSelf: 'flex-start',
    minHeight: servicesTokens.card.ctaHeight,
    borderRadius: servicesTokens.card.ctaRadius,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: '800',
  },
  disabledBadge: {
    alignSelf: 'flex-start',
    minHeight: servicesTokens.card.ctaHeight,
    borderRadius: servicesTokens.card.ctaRadius,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 11,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  disabledBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B91C1C',
  },
});
