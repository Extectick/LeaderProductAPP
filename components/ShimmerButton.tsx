// components/ShimmerButton.tsx
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type Props = Omit<PressableProps, 'style'> & {
  title: string;
  loading?: boolean;
  fullWidth?: boolean;
  gradientColors?: readonly [string, string];
  textStyle?: StyleProp<TextStyle>;
  style?: ViewStyle;
  haptics?: boolean;
};

const DEFAULT_GRADIENT: readonly [string, string] = ['#56AB2F', '#A8E063'];

export default function ShimmerButton({
  title,
  onPress,
  loading,
  disabled,
  fullWidth = true,
  gradientColors = DEFAULT_GRADIENT,
  textStyle,
  style,
  haptics = false,
  ...rest
}: Props) {
  // ширина кнопки — в shared value
  const width = useSharedValue(300);
  const progress = useSharedValue(0); // 0..1
  const scale = useSharedValue(1);
  const interaction = useSharedValue(0); // 0 idle, 1 hover, 2 press
  const hoveredRef = useRef(false);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width || 300;
    width.value = w;
  };

  // бесшовный цикл: едем от 0 до -w; при сбросе кадр не меняется
  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.linear }),
      -1,
      false
    );
  }, [progress]);

  const onPressIn = () => {
    interaction.value = withTiming(2, { duration: 120 });
    scale.value = withSpring(0.97, { stiffness: 320, damping: 20 });
  };
  const onPressOut = () => {
    interaction.value = withTiming(hoveredRef.current ? 1 : 0, { duration: 140 });
    scale.value = withSpring(hoveredRef.current ? 1.03 : 1, { stiffness: 320, damping: 20 });
  };
  const onHoverIn = () => {
    if (disabled || loading) return;
    hoveredRef.current = true;
    interaction.value = withTiming(1, { duration: 140 });
    scale.value = withSpring(1.03, { stiffness: 300, damping: 18 });
  };
  const onHoverOut = () => {
    hoveredRef.current = false;
    if (disabled || loading) return;
    interaction.value = withTiming(0, { duration: 160 });
    scale.value = withSpring(1, { stiffness: 300, damping: 18 });
  };

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Вся волновая «плитка» шириной 2w, двигается по X
  const overlayStyle = useAnimatedStyle(() => {
    const w = width.value;
    const shift = -interpolate(progress.value, [0, 1], [0, w], Extrapolation.CLAMP);
    return {
      width: w * 2,
      opacity: 0.22,
      transform: [{ translateX: shift }],
    };
  });

  const interactionOverlayStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      interaction.value,
      [0, 1, 2],
      ['rgba(255,255,255,0)', 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.12)']
    ),
  }));

  // Общая анимационная фаза (0..1) -> 0..2π
  const crestPhase = (mult = 1, add = 0) =>
    useAnimatedStyle(() => {
      const w = width.value;
      const t = (progress.value * Math.PI * 2) * mult + add;

      // ширина гребня (в пикселях) с «дыханием»
      const base = 0.32;   // доля от w
      const ampW = 0.14;   // амплитуда
      const cw = w * (base + ampW * Math.sin(t));

      // лёгкое «плавание» по Y
      const y = 4 * Math.sin(t * 0.8);

      // прозрачность в волне
      const op = 0.4 + 0.25 * Math.sin(t + Math.PI / 3);

      // центрируем гребень в пределах плитки w
      const left = (w - cw) / 2;

      return {
        width: cw,
        left,
        opacity: op,
        transform: [{ translateY: y }],
      };
    });

  // Гребень A (наклон вправо)
  const crestAStyle = crestPhase(1, 0);
  // Гребень B (в противофазе, тоньше; наклон влево)
  const crestBStyle = crestPhase(1, Math.PI);

  return (
    <Pressable
      {...rest}
      onPress={(e) => {
        if (haptics) Haptics.selectionAsync();
        onPress?.(e);
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      disabled={disabled || loading}
      style={[
        styles.wrapper,
        fullWidth && { alignSelf: 'stretch' },
        (disabled || loading) && { opacity: 0.65 },
        style,
      ]}
    >
      <Animated.View style={[styles.inner, innerStyle]} onLayout={onLayout}>
        {/* фоновый градиент кнопки */}
        <LinearGradient
          colors={[...gradientColors] as [string, string]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject as any}
        />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, interactionOverlayStyle]} />

        {/* ВОЛНА — плитка 2×w, внутри два одинаковых «тайла» шириной w */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, overlayStyle]}>
          {/* tile #1 (левая половина) */}
          <Animated.View style={styles.tile}>
            {/* crest A */}
            <Animated.View style={[styles.crestWrap, { transform: [{ rotateZ: '12deg' }] }, crestAStyle]}>
              <LinearGradient
                colors={['transparent', '#ffffff', 'transparent']}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject as any}
              />
            </Animated.View>
            {/* crest B */}
            <Animated.View style={[styles.crestWrap, { transform: [{ rotateZ: '-12deg' }] }, crestBStyle]}>
              <LinearGradient
                colors={['transparent', '#ffffff', 'transparent']}
                locations={[0.2, 0.5, 0.8]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject as any}
              />
            </Animated.View>
          </Animated.View>

          {/* tile #2 (правая половина, идентичная) */}
          <Animated.View style={[styles.tile, { left: '50%' }]}>
            <Animated.View style={[styles.crestWrap, { transform: [{ rotateZ: '12deg' }] }, crestAStyle]}>
              <LinearGradient
                colors={['transparent', '#ffffff', 'transparent']}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject as any}
              />
            </Animated.View>
            <Animated.View style={[styles.crestWrap, { transform: [{ rotateZ: '-12deg' }] }, crestBStyle]}>
              <LinearGradient
                colors={['transparent', '#ffffff', 'transparent']}
                locations={[0.2, 0.5, 0.8]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject as any}
              />
            </Animated.View>
          </Animated.View>
        </Animated.View>

        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.text, textStyle]}>{title}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#56AB2F',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  inner: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.3,
  },
  // половина «плитки»: ширина = 50% от overlay (то есть ровно w), высота — вся
  tile: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '50%',
    overflow: 'visible',
  },
  // одиночный гребень волны — делаем его выше контейнера, чтобы при повороте не резался
  crestWrap: {
    position: 'absolute',
    top: '-50%',
    height: '200%',
    borderRadius: 999,
  },
});
