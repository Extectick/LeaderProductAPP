import React, { useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { tintColor, shadeColor } from '@/utils/color';

type AnimatedButtonProps = {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
};

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({ title, onPress, style }) => {
  const scale = useSharedValue(1);
  const interaction = useSharedValue(0); // 0 idle, 1 hover, 2 press
  const hoveredRef = useRef(false);
  const baseColor = '#FF6F61';
  const hoverColor = useMemo(() => tintColor(baseColor, 0.12), [baseColor]);
  const pressColor = useMemo(() => shadeColor(baseColor, 0.12), [baseColor]);

  const onPressIn = () => {
    interaction.value = withTiming(2, { duration: 120 });
    scale.value = withSpring(0.96, { damping: 18, stiffness: 260 });
  };
  const onPressOut = () => {
    interaction.value = withTiming(hoveredRef.current ? 1 : 0, { duration: 140 });
    scale.value = withSpring(hoveredRef.current ? 1.03 : 1, { damping: 18, stiffness: 260 });
  };
  const onHoverIn = () => {
    hoveredRef.current = true;
    interaction.value = withTiming(1, { duration: 140 });
    scale.value = withSpring(1.03, { damping: 18, stiffness: 260 });
  };
  const onHoverOut = () => {
    hoveredRef.current = false;
    interaction.value = withTiming(0, { duration: 160 });
    scale.value = withSpring(1, { damping: 18, stiffness: 260 });
  };

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(interaction.value, [0, 1, 2], [baseColor, hoverColor, pressColor]),
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={({ pressed }) => [
        styles.button,
        style,
        pressed && styles.pressed,
      ]}
    >
      <Animated.View style={[styles.inner, aStyle]}>
        <Animated.Text style={styles.text}>{title}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    ...Platform.select({
      web: {
        boxShadow: '0px 8px 10px rgba(255, 111, 97, 0.3)',
      },
      ios: {
        boxShadow: '0 8px 10px 0 rgba(255,111,97,0.3)',
      },
      android: {
        elevation: 5,
      },
    }),
    alignItems: 'center',
  },
  inner: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
