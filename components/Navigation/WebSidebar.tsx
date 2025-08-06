import { tabScreens } from '@/constants/tabScreens';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, type RelativePathString } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

export default function WebSidebar() {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const widthAnim = useRef(new Animated.Value(60)).current;

  const bgColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const activeBgColor = useThemeColor({}, 'tint');

  // Анимация ширины при наведении
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: expanded ? 180 : 60,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [expanded, widthAnim]);

  return (
    <Animated.View
      style={[
        styles.sidebar,
        {
          width: widthAnim,
          backgroundColor: bgColor,
          shadowColor: '#000',
          shadowOffset: { width: 2, height: 0 },
          shadowOpacity: 0.15,
          shadowRadius: 10,
          elevation: 6,
        },
      ]}
      onPointerEnter={() => setExpanded(true)}
      onPointerLeave={() => setExpanded(false)}
    >
      {tabScreens.map(({ sidebar }) => {
        const isActive = pathname === sidebar.path;
        return (
          <Pressable
            key={sidebar.path}
            onPress={() => router.push(sidebar.path as RelativePathString)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            style={({ pressed, hovered }) => [
              styles.item,
              {
                backgroundColor: isActive
                  ? activeBgColor
                  : hovered
                  ? 'rgba(255, 255, 255, 0.1)'
                  : 'transparent',
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
          >
            <Ionicons
              name={sidebar.icon as any}
              size={24}
              color={isActive ? '#fff' : textColor}
            />
            <Animated.Text
              style={[
                styles.label,
                {
                  color: isActive ? '#fff' : textColor,
                  opacity: widthAnim.interpolate({
                    inputRange: [60, 180],
                    outputRange: [0, 1],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
              numberOfLines={1}
            >
              {sidebar.label}
            </Animated.Text>
          </Pressable>

        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    height: '100%',
    paddingTop: 24,
    paddingHorizontal: 4,
    flexDirection: 'column',
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    // чтобы текст не съезжал и не переносился
    flexShrink: 1,
  },
});
