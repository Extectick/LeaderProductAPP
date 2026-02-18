// ===== File: components/QRcodes/QRCodeItem.tsx =====
import { QRCodeItemType, QRType } from '@/src/entities/qr/types';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from 'moti/skeleton';
import React from 'react';
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

// ===== Карта русских названий и иконок по типам =====
const RU_LABELS: Record<QRType, string> = {
  PHONE: 'Телефон',
  LINK: 'Ссылка',
  EMAIL: 'Email',
  TEXT: 'Текст',
  WHATSAPP: 'WhatsApp',
  TELEGRAM: 'Telegram',
  CONTACT: 'Контакт',
  WIFI: 'Wi-Fi',
  SMS: 'SMS',
  GEO: 'Геолокация',
  BITCOIN: 'Bitcoin',
};

const TYPE_ICONS: Record<QRType, keyof typeof Ionicons.glyphMap> = {
  PHONE: 'call-outline',
  LINK: 'link-outline',
  EMAIL: 'mail-outline',
  TEXT: 'text-outline',
  WHATSAPP: 'logo-whatsapp',
  TELEGRAM: 'paper-plane-outline',
  CONTACT: 'person-outline',
  WIFI: 'wifi-outline',
  SMS: 'chatbubble-ellipses-outline',
  GEO: 'location-outline',
  BITCOIN: 'logo-bitcoin',
};

const TYPE_COLORS: Record<QRType, string> = {
  PHONE: '#0CA678',
  LINK: '#1D4ED8',
  EMAIL: '#EF4444',
  TEXT: '#6B7280',
  WHATSAPP: '#25D366',
  TELEGRAM: '#0088cc',
  CONTACT: '#9333EA',
  WIFI: '#0EA5E9',
  SMS: '#F59E0B',
  GEO: '#059669',
  BITCOIN: '#F7931A',
};

export type Props = {
  item: QRCodeItemType;
  onPress?: (item: QRCodeItemType) => void;
  onLongPress?: (item: QRCodeItemType) => void;
  loading?: boolean;
};

export default function QRCodeItem({ item, onPress, onLongPress, loading }: Props) {
  const scale = useSharedValue(1);
  const pointerStyle = Platform.OS === 'web' ? { cursor: 'pointer' as const } : {};

  const handlePressIn = () => { scale.value = withSpring(0.97); };
  const handlePressOut = () => { scale.value = withSpring(1); };
  const handleLongPress = (e: GestureResponderEvent) => onLongPress?.(item);
  const handlePress = () => onPress?.(item);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // формат сканов
  function formatScanCount(count: number) {
    if (count < 1000) return String(count);
    const formatted = count / 1000;
    return `${formatted.toFixed(1)}к`;
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: '#fff' }]}>
        <Skeleton height={40} width={40} radius={20} colorMode="light" />
        <View style={styles.textContainer}>
          <Skeleton height={14} width="60%" colorMode="light" />
          <View style={{ height: 6 }} />
          <Skeleton height={10} width="40%" colorMode="light" />
        </View>
        <Skeleton height={22} width={66} radius={999} colorMode="light" />
      </View>
    );
  }

  const typeColor = TYPE_COLORS[item.qrType];

  return (
    <Animated.View style={[styles.wrapper, animatedStyle]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLongPress={handleLongPress}
        onPress={handlePress}
        android_ripple={{ color: '#eee' }}
        style={({ pressed }) => [
          styles.container,
          {
            backgroundColor: '#fff',
            opacity: pressed ? 0.92 : 1,
            ...pointerStyle,
          },
        ]}
      >
        {/* Кружок слева с цветом типа и иконкой */}
        <View style={[styles.iconCircle, { backgroundColor: typeColor }]}>
          <Ionicons name={TYPE_ICONS[item.qrType]} size={20} color={'white'} />
        </View>

        {/* Текст: описание (основа) + урезанный qrData */}
        <View style={styles.textContainer}>
          <Text numberOfLines={2} style={[styles.title]}>
            {item.description || 'Без названия'}
          </Text>
          <Text numberOfLines={2} style={[styles.subtitle]}>
            {item.qrData.length > 32 ? item.qrData.slice(0, 32) + '…' : item.qrData}
          </Text>
        </View>

        {/* Бейдж типа с иконкой и названием */}
        <View style={[styles.typeBadge, { borderColor: typeColor }]}> 
          <Ionicons name={TYPE_ICONS[item.qrType]} size={12} color={typeColor} style={{ marginRight: 6 }} />
          <Text style={[styles.typeBadgeText, { color: typeColor }]}>{RU_LABELS[item.qrType]}</Text>
        </View>

        {/* Счётчик сканов */}
        <Text style={[styles.scanCount]}>
          {formatScanCount(item.scanCount ?? 0)}
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
    borderWidth: 1,
    borderColor: '#f1f1f1',
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
    fontWeight: '600',
    color: '#111',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  scanCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
});
