import { Colors, ThemeKey } from '@/constants/Colors';
import { useTheme } from '@/context/ThemeContext';
import { useQRCodeTypeIcon } from '@/hooks/useQRCodeTypeIcon';
import { QRCodeItemType } from '@/types/qrTypes';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import Skeleton from 'react-loading-skeleton';
import {
  GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';



type Props = {
  item: QRCodeItemType;
  onPress?: (item: QRCodeItemType) => void;
  onLongPress?: (item: QRCodeItemType) => void;
  loading?: boolean;
};


export default function QRCodeItem({ item, onPress, onLongPress, loading }: Props) {
  const scale = useSharedValue(1);
  const { iconName, color } = useQRCodeTypeIcon(item.qrType);
  const { theme } = useTheme();
  const colors = Colors[theme as ThemeKey];
  const pointerStyle = Platform.OS === 'web' ? { cursor: 'pointer' as const } : {};
  const handlePressIn = () => {
    scale.value = withSpring(0.97);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handleLongPress = (e: GestureResponderEvent) => {
    onLongPress?.(item);
  };

  const handlePress = () => {
    onPress?.(item);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const statusColor = {
    active: colors.success,
    inactive: colors.secondaryText,
    expired: colors.error,
  }[item.status.toLowerCase() as 'active' | 'inactive' | 'expired' || 'inactive'];

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.cardBackground }]}>
        <Skeleton height={40} width={40}/>
        <View style={styles.textContainer}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={10} width="40%" style={{ marginTop: 4 }} />
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.wrapper, animatedStyle]}>
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={handleLongPress}
      onPress={handlePress}
      android_ripple={{ color: colors.inputBorder }}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.cardBackground,
          opacity: pressed ? 0.9 : 1,
          ...pointerStyle,
        },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: statusColor }]}>
        <Ionicons name={iconName} size={20} color={"white"} />
      </View>

      <View style={styles.textContainer}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
          {item.description || 'Без названия'}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.secondaryText }]}>
          {item.qrData.length > 32 ? item.qrData.slice(0, 32) + '...' : item.qrData}
        </Text>
      </View>

      <Text style={[styles.scanCount, { color: colors.secondaryText }]}>
        {item.scanCount ?? 0}
      </Text>
    </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
  },
  container: {
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 12,
  },
  scanCount: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
});
