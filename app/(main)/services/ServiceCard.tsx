import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  icon: string;
  name: string;
  size: number;
  onPress: () => void;
  description?: string;

  /** Градиент акцентного бейджа/фона */
  gradient?: [string, string];

  /** Явный фон карточки (иначе из темы или из containerStyle.backgroundColor) */
  backgroundColor?: string;

  /** Цвет текста (иначе из темы) */
  textColor?: string;

  /** Размер иконки в бейдже */
  iconSize?: number;

  /** Отключить тень */
  disableShadow?: boolean;

  /** Отключить пружинку на нажатие */
  disableScaleOnPress?: boolean;

  /** Внешние стили (используются только маргины/радиус/фон) */
  containerStyle?: ViewStyle;

  /** Доп. стили текста */
  textStyle?: TextStyle;

  /** Заблокирована */
  disabled?: boolean;
}

/**
 * Новый дизайн ServiceCard:
 * - стеклянная карточка с мягким светом и градиентными «каплями»
 * - крупный круглый бейдж под иконку
 * - hover (web): лёгкий подъем и усиление свечения
 * - press (native): пружинка + ripple
 * - disabled: замок, понижение контраста, блокировка нажатий
 */
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
}: Props) {
  const themeCardBg = useThemeColor({}, 'cardBackground');
  const themeText = useThemeColor({}, 'text');
  const themeBorder = useThemeColor({}, 'inputBorder' as any);
  const themeSecondary = useThemeColor({}, 'secondaryText' as any);

  // Позволяем переопределять фон через props или containerStyle.backgroundColor
  const containerBg = (containerStyle as ViewStyle | undefined)?.backgroundColor;
  const cardBg = backgroundColor ?? containerBg ?? themeCardBg;
  const txtColor = textColor ?? themeText;

  const isWeb = Platform.OS === 'web';

  // --- Animation state ---
  const scale = useSharedValue(1);
  const hover = useSharedValue(0); // 0..1

  const onHoverIn = () => {
    if (!isWeb || disabled) return;
    hover.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
    if (!disableScaleOnPress) {
      scale.value = withTiming(1.015, { duration: 160 });
    }
  };
  const onHoverOut = () => {
    if (!isWeb) return;
    hover.value = withTiming(0, { duration: 220 });
    if (!disableScaleOnPress) {
      scale.value = withTiming(1, { duration: 180 });
    }
  };

  const onPressIn = () => {
    if (disabled || disableScaleOnPress) return;
    scale.value = withSpring(0.97, { damping: 18, stiffness: 260 });
  };
  const onPressOut = () => {
    if (disabled || disableScaleOnPress) return;
    scale.value = withSpring(1, { damping: 18, stiffness: 260 });
  };

  // --- Animated styles ---
  const aOuter = useAnimatedStyle(() => {
    const raise = hover.value * 4; // подъем на web
    return {
      transform: [{ scale: scale.value }, { translateY: -raise }],
      shadowOpacity: disableShadow ? 0 : 0.12 + hover.value * 0.10,
      shadowRadius: disableShadow ? 0 : 6 + hover.value * 10,
      elevation: disableShadow ? 0 : 3 + hover.value * 3,
    };
  });

  const aGlow = useAnimatedStyle(() => ({
    opacity: 0.14 + hover.value * 0.2,
    transform: [{ scale: 1 + hover.value * 0.04 }],
  }));

  // Акцентные цвета для бейджа/капель
  const [c1, c2] = useMemo<[string, string]>(() => {
    if (gradient?.length === 2) return gradient;
    return ['#7C3AED', '#4F46E5']; // фиолетово-индиговый по умолчанию
  }, [gradient]);

  // Разбор внешних стилей: чтобы не дублировать фон/бордер
  const flat = StyleSheet.flatten(containerStyle) as ViewStyle | undefined;
  const {
    margin, marginTop, marginRight, marginBottom, marginLeft, marginHorizontal, marginVertical,
    borderRadius,
  } = flat || {};
  const outerStyle: ViewStyle = {
    margin, marginTop, marginRight, marginBottom, marginLeft, marginHorizontal, marginVertical,
    borderRadius: borderRadius ?? 20,
    overflow: 'hidden', // для ripple
  };

  // Пропорции
  const radius = (outerStyle.borderRadius as number) || 18;
  const badge = Math.max(48, Math.floor(size * 0.32)); // круг под иконку

  return (
    <Animated.View style={[{ width: size, minHeight: size * 0.9 }, outerStyle, aOuter]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        disabled={disabled}
        onPress={() => !disabled && onPress()}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        // web hover
        {...(isWeb ? { onHoverIn, onHoverOut } : {})}
        android_ripple={{ color: '#E5E7EB' }}
        style={({ pressed }) => [
          styles.cardBase,
          {
            borderRadius: radius,
            backgroundColor: cardBg,
            borderColor: themeBorder,
            opacity: disabled ? 0.6 : 1,
          },
          pressed && Platform.OS === 'ios' ? { opacity: 0.9 } : null,
        ]}
      >
        {/* Декоративные капли/свечения */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {/* верхний правый градиентный овал */}
          <LinearGradient
            pointerEvents="none"
            colors={[c1 + '33', c2 + '22']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.blob,
              { top: -size * 0.18, right: -size * 0.12, width: size * 0.8, height: size * 0.6 },
            ]}
          />
          {/* нижний левый мягкий свет */}
          <LinearGradient
            pointerEvents="none"
            colors={[c2 + '22', c1 + '11']}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.blob,
              { bottom: -size * 0.2, left: -size * 0.2, width: size * 0.9, height: size * 0.7 },
            ]}
          />
          {/* скользящий блик */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.gloss,
              { borderRadius: radius },
              aGlow,
            ]}
          />
        </View>

        {/* Контент */}
        <View style={styles.content}>
          {/* Бейдж под иконку */}
          <LinearGradient
            colors={[c1, c2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.badge,
              {
                width: badge,
                height: badge,
                borderRadius: badge / 2,
                shadowColor: c1,
              },
            ]}
          >
            <Ionicons name={icon as any} size={iconSize} color="#fff" />
          </LinearGradient>

          <View style={{ gap: 4, width: '100%' }}>
            <Text
              numberOfLines={2}
              style={[
                styles.title,
                { color: txtColor },
                textStyle,
              ]}
            >
              {name}
            </Text>
            {description ? (
              <Text numberOfLines={3} style={styles.desc}>
                {description}
              </Text>
            ) : null}
          </View>

          {disabled && (
            <View style={styles.lockWrap}>
              <Ionicons name="lock-closed" size={14} color="#EF4444" />
              <Text style={styles.lockTxt}>Недоступно</Text>
            </View>
          )}

          {!disabled && (
            <View style={styles.ctaRow}>
              <Ionicons name="sparkles-outline" size={14} color={c1} />
              <Text style={[styles.ctaText, { color: themeSecondary }]}>
                Открыть
              </Text>
              <Ionicons name="arrow-forward" size={14} color={c1} />
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardBase: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',

    // тень (iOS) — часть усиливается анимацией aOuter
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    // Android тень настраивается elevation в aOuter
  },

  content: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 10,
  },

  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  title: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'left',
    letterSpacing: 0.2,
  },
  desc: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 16,
  },

  lockWrap: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  lockTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B91C1C',
  },
  ctaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#312E81',
  },

  // декоративные элементы
  blob: {
    position: 'absolute',
    borderRadius: 999,
    filter: Platform.OS === 'web' ? 'blur(12px)' as any : undefined,
  },
  gloss: {
    position: 'absolute',
    left: -40,
    right: -40,
    top: -10,
    height: 90,
    backgroundColor: '#FFFFFF',
    opacity: 0.12,
    transform: [{ rotate: '-12deg' }],
  },
});
