// components/ShimmerButton.tsx
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, PressableProps, StyleSheet, Text, ViewStyle } from 'react-native';

type Props = Omit<PressableProps, 'style'> & {
  title: string;
  loading?: boolean;
  fullWidth?: boolean;
  gradientColors?: readonly [string, string];
  textStyle?: any;
  style?: ViewStyle;
  haptics?: boolean; // лёгкий тик при нажатии
};

const DEFAULT_GRADIENT: readonly [string, string] = ['#56AB2F', '#A8E063']; // логотипные зелёные

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
  const shimmer = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-150, 150] });

  return (
    <Pressable
      {...rest}
      onPress={(e) => {
        if (haptics) Haptics.selectionAsync();
        onPress?.(e);
      }}
      onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, stiffness: 300 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 300 }).start()}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.wrapper,
        fullWidth && { alignSelf: 'stretch' },
        (disabled || loading) && { opacity: 0.65 },
        style,
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <Animated.View style={[styles.inner, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={[...gradientColors] as [string, string]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject as any}
        />
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: 0.22, transform: [{ translateX }] }]}
        >
          <LinearGradient
            colors={['transparent', '#ffffff', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject as any}
          />
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
});
