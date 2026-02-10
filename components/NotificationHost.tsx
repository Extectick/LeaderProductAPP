import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import {
  dismissNotification,
  markNotificationClosed,
  NotificationPayload,
  NotificationType,
  openNotificationLink,
  pushNotification,
  subscribeToNotificationDismiss,
  subscribeToNotifications,
} from '@/utils/notificationStore';

type Props = { children: React.ReactNode };

type ActiveNotification = Required<NotificationPayload> & {
  anim: Animated.Value;
  dragY: Animated.Value;
};

const palette: Record<NotificationType, { bg: string; text: string; border: string; icon: string }> = {
  info: { bg: '#E0F2FE', text: '#0F172A', border: '#0EA5E9', icon: 'information-circle-outline' },
  success: { bg: '#DCFCE7', text: '#0F172A', border: '#16A34A', icon: 'checkmark-circle-outline' },
  warning: { bg: '#FEF3C7', text: '#0F172A', border: '#D97706', icon: 'alert-circle-outline' },
  error: { bg: '#FEE2E2', text: '#0F172A', border: '#EF4444', icon: 'close-circle-outline' },
};

export function useNotify() {
  return pushNotification;
}

const withOpacity = (color: string, opacity: number) => {
  if (!color.startsWith('#')) return color;
  const hex = color.replace('#', '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const int = Number.parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export function NotificationHost({ children }: Props) {
  const [items, setItems] = useState<ActiveNotification[]>([]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTouchWeb =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    (typeof (window as any).ontouchstart !== 'undefined' ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
  const swipeEnabled = Platform.OS !== 'web' || isTouchWeb;
  const showClose = Platform.OS === 'web' && !isTouchWeb;
  const maxWidth = width >= 780 ? 520 : width >= 420 ? width - 28 : width - 18;

  const remove = useCallback((id: string, immediate = false) => {
    setItems((prev) => {
      const idx = prev.findIndex((n) => n.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      const [target] = next.splice(idx, 1);
      if (target && !immediate) {
        Animated.timing(target.anim, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start(() => {
          markNotificationClosed(id);
          setItems((p) => p.filter((n) => n.id !== id));
        });
        return prev;
      }
      markNotificationClosed(id);
      return next;
    });
  }, []);

  const add = useCallback((n: Required<NotificationPayload>) => {
    const anim = new Animated.Value(0);
    const dragY = new Animated.Value(0);
    const normalized: ActiveNotification = { ...n, anim, dragY };
    setItems((prev) => {
      const next = [normalized, ...prev].slice(0, 4);
      return next;
    });
    Animated.timing(anim, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    if (n.durationMs >= 0) {
      setTimeout(() => remove(n.id), n.durationMs || 5200);
    }
  }, [remove]);

  useEffect(() => {
    const unsub = subscribeToNotifications(add);
    const unsubDismiss = subscribeToNotificationDismiss((id) => remove(id, true));
    return () => {
      unsub();
      unsubDismiss();
    };
  }, [add, remove]);

  const containerStyle = useMemo(
    () => [
      styles.host,
      {
        paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 12 : 6) + 6,
      },
    ],
    [insets.top]
  );

  return (
    <View style={{ flex: 1 }}>
      {children}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View pointerEvents="box-none" style={containerStyle}>
          {items.map((item, idx) => {
            const colors = palette[item.type] || palette.info;
            const bg = item.backgroundColor || colors.bg;
            const border = item.borderColor || colors.border;
            const textColor = item.textColor || colors.text;
            const iconName = item.icon || colors.icon;
            const iconBg = withOpacity(border, 0.14);
            const entryTranslate = item.anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-18, 0],
            });
            const translateY = Animated.add(entryTranslate, item.dragY);
            const scale = item.anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] });
            const panResponder = PanResponder.create({
              onMoveShouldSetPanResponder: (_evt, gesture) => {
                if (!swipeEnabled) return false;
                const dy = gesture.dy;
                const dx = gesture.dx;
                return dy < -8 && Math.abs(dy) > Math.abs(dx);
              },
              onPanResponderMove: (_evt, gesture) => {
                if (!swipeEnabled) return;
                const next = Math.max(-80, Math.min(0, gesture.dy));
                item.dragY.setValue(next);
              },
              onPanResponderRelease: (_evt, gesture) => {
                if (!swipeEnabled) return;
                const shouldDismiss = gesture.dy < -35 || gesture.vy < -0.6;
                if (shouldDismiss) {
                  dismissNotification(item.id);
                } else {
                  Animated.spring(item.dragY, {
                    toValue: 0,
                    useNativeDriver: false,
                    damping: 18,
                    stiffness: 220,
                  }).start();
                }
              },
            });
            return (
              <Animated.View
                key={item.id}
                style={[
                  styles.card,
                  {
                    transform: [
                      { translateY },
                      { scale },
                    ],
                    opacity: item.anim,
                    backgroundColor: bg,
                    borderColor: border,
                    maxWidth,
                    marginTop: idx === 0 ? 0 : 8,
                  },
                ]}
                {...(swipeEnabled ? panResponder.panHandlers : {})}
              >
                <Pressable
                  onPress={() => {
                    if (item.onPress) item.onPress();
                    if (item.actionHref) openNotificationLink(item.actionHref);
                    dismissNotification(item.id);
                  }}
                  style={({ pressed }) => [
                    styles.inner,
                    pressed && { opacity: 0.92 },
                    { flexDirection: 'row', alignItems: 'flex-start' },
                  ]}
                >
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.iconWrap, { borderColor: border, backgroundColor: iconBg }]}>
                      <Ionicons name={iconName as any} size={18} color={border} />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    {item.title ? (
                      <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
                        {item.title}
                      </Text>
                    ) : null}
                    <Text style={[styles.message, { color: textColor }]} numberOfLines={4}>
                      {item.message}
                    </Text>
                    {item.actionLabel ? (
                      <Text style={[styles.link, { color: border }]} numberOfLines={2}>
                        {item.actionLabel}
                      </Text>
                    ) : null}
                  </View>
                  {showClose ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Закрыть уведомление"
                      onPress={(e) => {
                        (e as any)?.stopPropagation?.();
                        dismissNotification(item.id);
                      }}
                      style={({ pressed }) => [
                        styles.closeBtn,
                        { borderColor: border, backgroundColor: iconBg },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Ionicons name="close" size={14} color={border} />
                    </Pressable>
                  ) : null}
                  {swipeEnabled ? (
                    <Text style={[styles.swipeHint, { color: textColor }]} numberOfLines={1}>
                      свайп вверх
                    </Text>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 10,
    pointerEvents: 'box-none',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    overflow: 'hidden',
  },
  inner: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: '#E5E7EB',
  },
  title: {
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  message: {
    fontSize: 13,
    lineHeight: 17,
  },
  link: {
    fontWeight: '700',
    fontSize: 13,
    textDecorationLine: 'underline',
    flexShrink: 1,
  },
  swipeHint: {
    marginLeft: 10,
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.6,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
