import { useThemeColor } from '@/hooks/useThemeColor';
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

  gradient?: [string, string];
  backgroundColor?: string;
  textColor?: string;
  iconSize?: number;

  disableShadow?: boolean;
  disableScaleOnPress?: boolean;

  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
}

/**
 * Адаптивная карточка сервиса
 * - Мобильные: press scale (легкий подпрыг)
 * - Web: hover-tilt (3D наклон), мягкая подсветка рамки, парящий блик
 */
export default function ServiceCard({
  icon,
  name,
  size,
  onPress,

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
  const themeBackground = useThemeColor({}, 'cardBackground');
  const themeTextColor = useThemeColor({}, 'text');

  const bgColor = backgroundColor ?? themeBackground;
  const txtColor = textColor ?? themeTextColor;
  const isWeb = Platform.OS === 'web';

  // animation state
  const scale = useSharedValue(1);
  const hover = useSharedValue(0); // 0..1
  const rx = useSharedValue(0);    // rotateX deg
  const ry = useSharedValue(0);    // rotateY deg
  const glow = useSharedValue(0);  // glow intensity 0..1

  const onHoverIn = () => {
    if (!isWeb || disabled) return;
    hover.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
    glow.value = withTiming(1, { duration: 320 });
    scale.value = withTiming(1.02, { duration: 160 });
  };
  const onHoverOut = () => {
    if (!isWeb) return;
    hover.value = withTiming(0, { duration: 220 });
    glow.value = withTiming(0, { duration: 260 });
    rx.value = withTiming(0, { duration: 220 });
    ry.value = withTiming(0, { duration: 220 });
    scale.value = withTiming(1, { duration: 200 });
  };

  const onMove = (e: any) => {
    if (!isWeb) return;
    const rect = e.currentTarget?.getBoundingClientRect?.();
    if (!rect) return;
    const px = (e.nativeEvent?.pageX ?? e.pageX) - rect.left;
    const py = (e.nativeEvent?.pageY ?? e.pageY) - rect.top;
    const nx = (px / rect.width) * 2 - 1;  // -1..1
    const ny = (py / rect.height) * 2 - 1; // -1..1

    const maxTilt = 8; // deg
    ry.value = withTiming(nx * maxTilt, { duration: 70 });
    rx.value = withTiming(-ny * maxTilt, { duration: 70 });
  };

  const onPressIn = () => {
    if (disabled || disableScaleOnPress) return;
    scale.value = withSpring(0.97, { damping: 18, stiffness: 260 });
  };
  const onPressOut = () => {
    if (disabled || disableScaleOnPress) return;
    scale.value = withSpring(1, { damping: 18, stiffness: 260 });
  };

  const animated = useAnimatedStyle(() => {
    return {
      transform: [
        { perspective: 800 },
        { rotateX: `${rx.value}deg` },
        { rotateY: `${ry.value}deg` },
        { scale: scale.value },
      ],
      shadowOpacity: disableShadow ? 0 : 0.14 + glow.value * 0.08,
      shadowRadius: disableShadow ? 0 : 8 + glow.value * 10,
      elevation: disableShadow ? 0 : 5 + glow.value * 3,
    };
  });

  const gloss = useAnimatedStyle(() => {
    return {
      opacity: 0.1 + hover.value * 0.2,
      transform: [
        { translateX: withTiming(hover.value ? 30 : -30, { duration: 400 }) },
        { rotate: '-20deg' },
      ],
    };
  });

  const ringColors = useMemo<[string, string, string]>(() => {
    const c1 = gradient?.[0] ?? '#6EE7F9';
    const c2 = gradient?.[1] ?? '#A78BFA';
    return [c1, c2, c1];
  }, [gradient]);

  const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

  return (
    <AnimatedPressable
      onPress={() => !disabled && onPress()}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      // web-only hover
      {...(isWeb ? { onHoverIn, onHoverOut, onMouseMove: onMove } : {})}
      disabled={disabled}
      // @ts-ignore title (web)
      title={disabled ? 'Сервис временно недоступен' : undefined}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      {/* Градиентная рамка с padding */}
      <View style={[{ width: size, height: size, borderRadius: 18 }, containerStyle]}>
        <LinearGradient
          colors={ringColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[
            styles.inner,
            {
              borderRadius: 16,
              backgroundColor: disabled ? `${bgColor}AA` : bgColor,
              shadowColor: '#000',
            },
            animated,
          ]}
        >
          {/* фон-градиент или плоский фон */}
          {gradient ? (
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
            />
          ) : null}

          {/* лёгкий блик, активнее при hover */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: -20,
                left: -40,
                width: size * 0.7,
                height: size * 1.2,
                borderRadius: 24,
                backgroundColor: '#fff',
              },
              gloss,
            ]}
          />

          {/* контент */}
          <View style={styles.content}>
            <Ionicons name={icon as any} size={iconSize} color={txtColor} />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                numberOfLines={2}
                style={[
                  styles.title,
                  {
                    color: txtColor,
                    textDecorationLine: disabled ? 'line-through' : undefined,
                  },
                  textStyle,
                ]}
              >
                {name}
              </Text>
              {disabled && (
                <Ionicons name="lock-closed" size={14} color="#ff3b30" style={{ marginLeft: 4, marginTop: 8 }} />
              )}
            </View>
          </View>
        </Animated.View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  inner: {
    flex: 1,
    margin: 2, // толщина «рамки»
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 8,
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
});
