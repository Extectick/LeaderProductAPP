import React, { useCallback, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet } from 'react-native';

type Props = {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  hoverScale?: number;
  pressScale?: number;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  webTitle?: string;
};

export default function AnimatedPressable({
  children,
  onPress,
  disabled,
  hoverScale = 1.015,
  pressScale = 0.99,
  onHoverIn,
  onHoverOut,
  webTitle,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (value: number) => {
      Animated.timing(scale, {
        toValue: value,
        duration: 140,
        useNativeDriver: true,
      }).start();
    },
    [scale]
  );

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onHoverIn={() => {
          animateTo(hoverScale);
          onHoverIn?.();
        }}
        onHoverOut={() => {
          animateTo(1);
          onHoverOut?.();
        }}
        onPressIn={() => animateTo(pressScale)}
        onPressOut={() => animateTo(Platform.OS === 'web' ? hoverScale : 1)}
        style={styles.fill}
        {...(Platform.OS === 'web' && webTitle ? ({ title: webTitle } as any) : {})}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingHorizontal: 4,
  },
  fill: {
    width: '100%',
  },
});
