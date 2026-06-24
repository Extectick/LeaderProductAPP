import { useThemeColor } from '@/hooks/useThemeColor';
import { servicesTokens, withOpacity } from '@/src/features/services/ui/servicesTokens';
import type { ServiceKind } from '@/utils/servicesService';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import { Surface, Text, TouchableRipple } from 'react-native-paper';
import Animated, {
  FadeIn,
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

function getHexLuminance(color: string) {
  if (!color.startsWith('#')) return 1;
  const hex = color.replace('#', '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : hex;
  if (normalized.length !== 6) return 1;
  const int = Number.parseInt(normalized, 16);
  if (Number.isNaN(int)) return 1;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function getReadableAccent(gradient?: [string, string]) {
  const candidates = [gradient?.[0], gradient?.[1], '#2563EB'].filter(Boolean) as string[];
  return candidates.reduce((best, current) =>
    getHexLuminance(current) < getHexLuminance(best) ? current : best
  );
}

export default function ServiceCard({
  icon,
  name,
  size,
  onPress,
  description,
  gradient,
  backgroundColor,
  textColor,
  iconSize = 26,
  disableScaleOnPress = false,
  containerStyle,
  textStyle,
  disabled = false,
  enterIndex = 0,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const pressScale = useSharedValue(1);
  const themeCardBg = useThemeColor({}, 'cardBackground');
  const themeText = useThemeColor({}, 'text');
  const themeBorder = useThemeColor({}, 'inputBorder' as any);
  const themeSecondary = useThemeColor({}, 'secondaryText' as any);
  const flattenedContainer = StyleSheet.flatten(containerStyle) as ViewStyle | undefined;
  const cardBg = backgroundColor ?? flattenedContainer?.backgroundColor ?? themeCardBg ?? servicesTokens.card.background;
  const textPrimary = textColor ?? themeText;

  const accent = useMemo(() => getReadableAccent(gradient), [gradient]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const handlePressIn = () => {
    if (disabled || disableScaleOnPress || reduceMotion) return;
    pressScale.value = withTiming(servicesTokens.motion.pressScale, {
      duration: servicesTokens.motion.pressDurationMs,
    });
  };

  const handlePressOut = () => {
    if (disableScaleOnPress || reduceMotion) return;
    pressScale.value = withTiming(1, {
      duration: servicesTokens.motion.pressDurationMs,
    });
  };

  return (
    <Animated.View
      entering={
        reduceMotion
          ? undefined
          : FadeIn.delay(enterIndex * servicesTokens.motion.enterDelayStepMs).duration(
              servicesTokens.motion.enterDurationMs
            )
      }
      style={[{ width: size }, animatedStyle]}
    >
      <Surface
        mode="flat"
        elevation={0}
        style={[
          styles.surface,
          {
            borderColor: disabled
              ? servicesTokens.states.disabledBorder
              : hovered
                ? withOpacity(accent, 0.38)
                : themeBorder || servicesTokens.card.borderColor,
            backgroundColor: disabled
              ? servicesTokens.states.disabledBackground
              : hovered
                ? withOpacity(accent, 0.035)
                : cardBg,
            opacity: disabled ? servicesTokens.states.disabledOpacity : 1,
          },
        ]}
      >
        <TouchableRipple
          accessibilityRole="button"
          accessibilityLabel={name}
          borderless={false}
          disabled={disabled}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          rippleColor={withOpacity(accent, 0.12)}
          underlayColor={withOpacity(accent, 0.04)}
          {...(isWeb
            ? {
                onHoverIn: () => !disabled && setHovered(true),
                onHoverOut: () => setHovered(false),
              }
            : {})}
          style={styles.touchable}
        >
          <View style={styles.row}>
            <View
              style={[
                styles.iconPanel,
                {
                  backgroundColor: disabled ? '#E2E8F0' : withOpacity(accent, 0.09),
                  borderRightColor: disabled ? '#CBD5E1' : withOpacity(accent, 0.18),
                },
              ]}
            >
              <View style={[styles.iconGlyph, { backgroundColor: disabled ? '#F1F5F9' : withOpacity(accent, 0.08) }]}>
                <Ionicons
                  name={icon as any}
                  size={iconSize}
                  color={disabled ? servicesTokens.states.disabledText : accent}
                />
              </View>
            </View>

            <View style={styles.copy}>
              <Text
                variant="titleMedium"
                numberOfLines={2}
                style={[
                  styles.title,
                  { color: disabled ? servicesTokens.states.disabledText : textPrimary },
                  textStyle,
                ]}
              >
                {name}
              </Text>
              {description ? (
                <Text
                  variant="bodyMedium"
                  numberOfLines={2}
                  style={[
                    styles.description,
                    { color: disabled ? '#7A8BA3' : themeSecondary || '#475569' },
                  ]}
                >
                  {description}
                </Text>
              ) : null}
            </View>

            <View style={styles.trailing}>
              {disabled ? (
                <Text numberOfLines={1} style={styles.disabledText}>
                  Недоступно
                </Text>
              ) : (
                <Ionicons name="chevron-forward" size={22} color={accent} />
              )}
            </View>
          </View>
        </TouchableRipple>
      </Surface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  surface: {
    minHeight: servicesTokens.card.minHeight,
    borderRadius: servicesTokens.card.radius,
    borderWidth: servicesTokens.card.borderWidth,
    overflow: 'hidden',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  touchable: {
    minHeight: servicesTokens.card.minHeight,
  },
  row: {
    minHeight: servicesTokens.card.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: servicesTokens.card.paddingHorizontal,
  },
  iconPanel: {
    width: 82,
    alignSelf: 'stretch',
    borderRightWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    width: servicesTokens.card.iconContainerMaxSize,
    height: servicesTokens.card.iconContainerMaxSize,
    borderRadius: servicesTokens.card.iconRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: servicesTokens.card.titleSize,
    lineHeight: servicesTokens.card.titleLineHeight,
    fontWeight: '800',
    letterSpacing: 0,
  },
  description: {
    fontSize: servicesTokens.card.descSize,
    lineHeight: servicesTokens.card.descLineHeight,
    fontWeight: '500',
    letterSpacing: 0,
  },
  trailing: {
    width: 72,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  disabledText: {
    color: servicesTokens.states.disabledText,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
});
