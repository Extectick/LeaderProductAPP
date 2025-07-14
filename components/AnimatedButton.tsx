import React from 'react';
import { Animated, Platform, Pressable, StyleSheet, ViewStyle } from 'react-native';

type AnimatedButtonProps = {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
};

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({ title, onPress, style }) => {
  const scale = React.useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.button,
        style,
        pressed && styles.pressed,
        { transform: [{ scale }] },
      ]}
    >
      <Animated.Text style={styles.text}>{title}</Animated.Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FF6F61',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    ...Platform.select({
      web: {
        boxShadow: '0px 8px 10px rgba(255, 111, 97, 0.3)',
      },
      ios: {
        shadowColor: '#FF6F61',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
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
