import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';

import ShimmerButton from '@/components/ShimmerButton';
import { shadeColor, tintColor } from '@/utils/color';

type MiniButtonColors = {
  buttonText: string;
  text: string;
  disabledText: string;
  disabledBackground: string;
  border: string;
  tint: string;
  inputBackground: string;
  cardBackground: string;
};

type MiniButtonProps = {
  title: React.ReactNode;
  onPress: () => void;
  colors: MiniButtonColors;
  variant?: 'filled' | 'outline';
  disabled?: boolean;
};

export const MiniButton: React.FC<MiniButtonProps> = ({
  title,
  onPress,
  colors,
  variant = 'filled',
  disabled,
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);

  const pressIn = () => {
    if (disabled) return;
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, friction: 5 }).start();
  };

  const pressOut = () => {
    if (disabled) return;
    const to = hoveredRef.current ? 1.03 : 1;
    Animated.spring(scale, { toValue: to, useNativeDriver: true, friction: 5 }).start();
  };

  const hoverIn = () => {
    if (disabled) return;
    hoveredRef.current = true;
    setHovered(true);
    Animated.spring(scale, { toValue: 1.03, useNativeDriver: true, friction: 5 }).start();
  };

  const hoverOut = () => {
    if (disabled) return;
    hoveredRef.current = false;
    setHovered(false);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  };

  const baseText = variant === 'filled' ? colors.buttonText : colors.text;
  const textColor = disabled ? colors.disabledText : baseText;
  const disabledBg = colors.disabledBackground;
  const disabledBorder = colors.disabledBackground || colors.border;
  const baseBg = variant === 'filled' ? colors.tint : 'transparent';
  const hoverBg =
    variant === 'filled'
      ? tintColor(colors.tint, 0.12)
      : colors.inputBackground || colors.cardBackground;
  const pressBg =
    variant === 'filled'
      ? shadeColor(colors.tint, 0.12)
      : tintColor(colors.inputBackground || colors.cardBackground, 0.08);

  const renderTitle =
    typeof title === 'string' || typeof title === 'number' ? (
      <Text style={{ color: textColor, fontWeight: '700' }}>{title}</Text>
    ) : (
      title
    );

  return (
    <Animated.View style={{ transform: [{ scale }], flexGrow: 1 }}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onHoverIn={hoverIn}
        onHoverOut={hoverOut}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          {
            height: 44,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 14,
            marginVertical: 4,
            backgroundColor: baseBg,
          },
          disabled
            ? { backgroundColor: disabledBg, borderWidth: 1, borderColor: disabledBorder }
            : variant === 'filled'
              ? null
              : { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
          hovered && !pressed && !disabled ? { backgroundColor: hoverBg } : null,
          pressed && !disabled ? { backgroundColor: pressBg } : null,
        ]}
      >
        {renderTitle}
      </Pressable>
    </Animated.View>
  );
};

type BounceButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  gradientColors: [string, string];
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
};

export const BounceButton: React.FC<BounceButtonProps> = ({
  title,
  onPress,
  loading,
  gradientColors,
  textStyle,
  style,
}) => {
  return (
    <ShimmerButton
      title={title}
      onPress={onPress}
      loading={loading}
      haptics
      gradientColors={gradientColors}
      textStyle={textStyle}
      style={style ? StyleSheet.flatten(style) : undefined}
    />
  );
};
