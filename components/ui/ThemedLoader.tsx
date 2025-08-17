// components/ThemedLoader.tsx
import { useThemeColor } from '@/hooks/useThemeColor';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';

type Props = {
  /** Размер квадрата */
  size?: number;
  /** Толщина линии */
  stroke?: number;
  /** Длительность полного круга, мс */
  duration?: number;
  /** Доп. стиль обёртки */
  style?: ViewStyle;
  /** Цвета линий (по умолчанию — из темы) */
  colors?: { a?: string; b?: string };
  /** Скругление углов (по умолчанию size * 0.77 как в примере) */
  radius?: number;
};

const KF = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]; // ключевые кадры как в CSS

function makeInsetInterpolations(progress: Animated.Value, d: number) {
  // значения "inset: top right bottom left" из твоего CSS (там 35px при 65px)
  const T = [0, 0, d, d, d, 0, 0, 0, 0];
  const R = [d, d, d, 0, 0, 0, 0, 0, d];
  const B = [d, 0, 0, 0, 0, 0, d, d, d];
  const L = [0, 0, 0, 0, d, d, d, 0, 0];

  return {
    top: progress.interpolate({ inputRange: KF, outputRange: T }),
    right: progress.interpolate({ inputRange: KF, outputRange: R }),
    bottom: progress.interpolate({ inputRange: KF, outputRange: B }),
    left: progress.interpolate({ inputRange: KF, outputRange: L }),
  };
}

export default function ThemedLoader({
  size = 65,
  stroke = 3,
  duration = 2500,
  radius,
  style,
  colors,
}: Props) {
  // Цвета из темы
  const tint = useThemeColor({}, 'tint');           // основной акцент
  const border = useThemeColor({}, 'border');       // вторичный
  const buttonText = useThemeColor({}, 'buttonText'); // для тёмной темы хорошо виден

  const cA = colors?.a ?? tint;
  const cB = colors?.b ?? (border || buttonText);

  // Прогресс анимации для двух слоёв (вторая дорожка со сдвигом фазы)
  const p1 = useRef(new Animated.Value(0)).current;
  const p2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    p1.setValue(0);
    p2.setValue(0);
    const a1 = Animated.loop(
      Animated.timing(p1, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: false })
    );
    const a2 = Animated.loop(
      Animated.sequence([
        Animated.delay(duration / 2),
        Animated.timing(p2, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: false }),
      ])
    );
    a1.start();
    a2.start();
    return () => {
      a1.stop();
      a2.stop();
    };
  }, [duration, p1, p2]);

  // Коэффициент перевода 35px из CSS под текущий size (35/65 ≈ 0.5385)
  const insetDist = useMemo(() => Math.round(size * (35 / 65)), [size]);
  const borderRadius = radius ?? Math.round(size * 0.77); // близко к 50px при 65px

  const insetA = makeInsetInterpolations(p1, insetDist);
  const insetB = makeInsetInterpolations(p2, insetDist);

  const common = {
    borderRadius,
    borderWidth: stroke,
    position: 'absolute' as const,
  };

  return (
    <View style={[styles.box, { width: size, height: size }, style]}>
      {/* слой A */}
      <Animated.View
        style={[
          common,
          {
            borderColor: cA,
            top: insetA.top,
            right: insetA.right,
            bottom: insetA.bottom,
            left: insetA.left,
          },
        ]}
      />
      {/* слой B (со сдвигом фазы) */}
      <Animated.View
        style={[
          common,
          {
            borderColor: cB,
            top: insetB.top,
            right: insetB.right,
            bottom: insetB.bottom,
            left: insetB.left,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
