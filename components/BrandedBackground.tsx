import { LinearGradient } from 'expo-linear-gradient';
import React, { PropsWithChildren, useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
// Для bare RN вместо строки выше:
// import LinearGradient from 'react-native-linear-gradient';
import type { SharedValue } from 'react-native-reanimated';

const AnimatedLG = Animated.createAnimatedComponent(LinearGradient);

function useLayerStyle(t: SharedValue<number>, base: number, amp: number) {
  return useAnimatedStyle(() => {
    const twoPi = Math.PI * 2;
    const x = Math.sin(t.value * twoPi) * base * amp;
    const y = Math.cos(t.value * twoPi) * base * amp;
    const rot = `${t.value * 360}deg`;
    const scale = 1.1 + 0.15 * Math.cos(t.value * twoPi);
    const opacity = 0.35 + 0.35 * Math.sin(t.value * twoPi);
    return {
      opacity,
      transform: [{ translateX: x }, { translateY: y }, { rotate: rot }, { scale }],
    };
  });
}

export interface AuroraBackgroundProps extends PropsWithChildren {
  /** Ускорение/замедление анимации, 1 — по умолчанию */
  speed?: number;
  /** Доп. стили корневого контейнера */
  style?: StyleProp<ViewStyle>;
}

/**
 * Светлый «aurora»-фон (без тёмных цветов).
 * Использование: <BrandedBackground><YourContent /></BrandedBackground>
 */
export default function BrandedBackground({
  children,
  style,
  speed = 1,
}: AuroraBackgroundProps) {
  const { width, height } = useWindowDimensions();
  const base = Math.max(width, height);
  const size = base * 1.8; // запас, чтобы при повороте не было пустых краёв

  // три независимых «пятна» градиента
  const t1 = useSharedValue<number>(0);
  const t2 = useSharedValue<number>(0);
  const t3 = useSharedValue<number>(0);

  useEffect(() => {
    const common = (durationMs: number) =>
      withRepeat(
        withTiming(1, {
          duration: durationMs / Math.max(0.25, speed),
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true
      );

    t1.value = common(16000);
    t2.value = common(20000);
    t3.value = common(24000);
  }, [speed, t1, t2, t3]);
  const layer1 = useLayerStyle(t1, base, 0.08);
  const layer2 = useLayerStyle(t2, base, 0.12);
  const layer3 = useLayerStyle(t3, base, 0.10);

  const centeredFrame: ViewStyle = {
    width: size,
    height: size,
    left: (width - size) / 2,
    top: (height - size) / 2,
    borderRadius: size / 2,
    position: 'absolute',
  };

  return (
    <View style={[styles.container, style]}>
      {/* слой 1 — светло-холодные тона */}
      <AnimatedLG
        pointerEvents="none"
        colors={['#bfdbfe', '#a5f3fc', '#ddd6fe']} // blue-200, cyan-200, violet-200
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 0.9 }}
        style={[styles.gradient, centeredFrame, layer1]}
      />
      {/* слой 2 — светлые тёплые */}
      <AnimatedLG
        pointerEvents="none"
        colors={['#fbcfe8', '#fde68a', '#e9d5ff']} // pink-200, amber-200, purple-200
        start={{ x: 0.2, y: 0.8 }}
        end={{ x: 0.8, y: 0.2 }}
        style={[styles.gradient, centeredFrame, layer2]}
      />
      {/* слой 3 — мягкие зелёные акценты */}
      <AnimatedLG
        pointerEvents="none"
        colors={['#bbf7d0', '#a7f3d0', '#d9f99d']} // green-200, emerald-200, lime-200
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.gradient, centeredFrame, layer3]}
      />

      {/* ваш контент всегда сверху */}
      <View style={styles.content} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // светлая подложка вместо #050816
  container: { flex: 1, backgroundColor: '#f8fafc', overflow: 'hidden' }, // slate-50
  gradient: {
    // opacity управляется анимированным стилем; это поле можно оставить пустым
  },
  content: {
    ...StyleSheet.absoluteFillObject,
  },
});
