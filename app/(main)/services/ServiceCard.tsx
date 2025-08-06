import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';


import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface Props {
  icon: string;
  name: string;
  size: number;
  onPress: () => void;
  gradient?: [string, string];    // Градиент: два цвета
  backgroundColor?: string;       // Цвет фона карточки (если не указан, берётся из темы)
  textColor?: string;             // Цвет текста (по умолчанию из темы)
  iconSize?: number;              // Размер иконки (по умолчанию 32)
  disableShadow?: boolean;        // Отключить тень (по умолчанию false)
  disableScaleOnPress?: boolean;  // Отключить анимацию масштаба при нажатии (по умолчанию false)
  containerStyle?: ViewStyle;     // Доп. стили для контейнера
  textStyle?: TextStyle;          // Доп. стили для текста
  disabled?: boolean;             // Отключить карточку (по умолчанию false)
}

export default function ServiceCard({
  icon,
  name,
  size,
  onPress,
  gradient,
  backgroundColor,
  textColor,
  iconSize = 32,
  disableShadow = false,
  disableScaleOnPress = false,
  containerStyle,
  textStyle,
  disabled = false,
}: Props) {
  const scale = useSharedValue(1);
  const themeBackground = useThemeColor({}, 'cardBackground');
  const themeTextColor = useThemeColor({}, 'text');

  const bgColor = backgroundColor ?? themeBackground;
  const txtColor = textColor ?? themeTextColor;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const Content = (
    <>
      <Ionicons name={icon as any} size={iconSize} color={txtColor} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          style={[
            {
              marginTop: 8,
              color: txtColor,
              fontWeight: '500',
              fontSize: 14,
              textAlign: 'center',
              textDecorationLine: disabled ? 'line-through' : undefined,
            },
            textStyle,
          ]}
          numberOfLines={2}
        >
          {name}
        </Text>
        {disabled && (
          <Ionicons 
            name="lock-closed" 
            size={14} 
            color="#ff3b30"
            style={{ marginLeft: 4, marginTop: 8 }}
          />
        )}
      </View>
    </>
  );

  const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
  
  return (
    <AnimatedPressable
      onPressIn={() => {
        if (!disabled && !disableScaleOnPress) scale.value = withSpring(0.95);
      }}
      onPressOut={() => {
        if (!disabled && !disableScaleOnPress) scale.value = withSpring(1);
      }}
      onPress={() => {
        if (disabled) return;
        console.log('Pressable pressed');
        onPress();
      }}
      onLongPress={() => {
        if (disabled) return;
        console.log('Long press - fallback');
        onPress();
      }}
      disabled={disabled}
      // @ts-ignore - web only prop
      title={disabled ? 'Сервис временно недоступен' : undefined}
    >
          <Animated.View
            style={[
              {
                width: size,
                height: size,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 12,
                // Тень
                shadowColor: disableShadow ? undefined : '#000',
                shadowOffset: disableShadow ? undefined : { width: 0, height: 2 },
                shadowOpacity: disableShadow ? undefined : 0.1,
                shadowRadius: disableShadow ? undefined : 4,
                elevation: disableShadow ? 0 : 4,
                overflow: 'hidden', // чтобы градиент не вылазил за углы
                opacity: disabled ? 0.5 : 1,
                backgroundColor: disabled ? 'rgba(0,0,0,0.1)' : undefined,
              },
              animatedStyle,
              containerStyle,
            ]}
          >
        {gradient ? (
          <LinearGradient
            colors={gradient}
            start={[0, 0]}
            end={[1, 1]}
            style={{
              ...StyleSheet.absoluteFillObject,
              borderRadius: 16,
              zIndex: -1,
            }}
          />
        ) : (
          <Animated.View
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: bgColor,
              borderRadius: 16,
              zIndex: -1,
            }}
          />
        )}
        {Content}
      </Animated.View>
    </AnimatedPressable>
  );
}
