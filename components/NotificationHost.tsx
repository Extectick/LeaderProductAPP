import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  NotificationPayload,
  NotificationType,
  openNotificationLink,
  pushNotification,
  subscribeToNotifications,
} from '@/utils/notificationStore';

type Props = { children: React.ReactNode };

type ActiveNotification = Required<NotificationPayload> & {
  anim: Animated.Value;
};

const palette: Record<NotificationType, { bg: string; text: string; border: string }> = {
  info: { bg: '#0ea5e933', text: '#0f172a', border: '#0ea5e9' },
  success: { bg: '#22c55e33', text: '#0f172a', border: '#16a34a' },
  warning: { bg: '#f59e0b33', text: '#0f172a', border: '#d97706' },
  error: { bg: '#ef444433', text: '#0f172a', border: '#ef4444' },
};

export function useNotify() {
  return pushNotification;
}

export function NotificationHost({ children }: Props) {
  const [items, setItems] = useState<ActiveNotification[]>([]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const maxWidth = width >= 780 ? 520 : width >= 420 ? width - 28 : width - 18;

  const remove = (id: string, immediate = false) => {
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
        }).start(() => setItems((p) => p.filter((n) => n.id !== id)));
        return prev;
      }
      return next;
    });
  };

  const add = (n: Required<NotificationPayload>) => {
    const anim = new Animated.Value(0);
    const normalized: ActiveNotification = { ...n, anim };
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
  };

  useEffect(() => {
    const unsub = subscribeToNotifications(add);
    return () => unsub();
  }, []);

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
            return (
              <Animated.View
                key={item.id}
                style={[
                  styles.card,
                  {
                    transform: [
                      {
                        translateY: item.anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-18, 0],
                        }),
                      },
                    ],
                    opacity: item.anim,
                    backgroundColor: bg,
                    borderColor: border,
                    maxWidth,
                    marginTop: idx === 0 ? 0 : 8,
                  },
                ]}
              >
                <Pressable
                  onPress={() => {
                    if (item.onPress) item.onPress();
                    if (item.actionHref) openNotificationLink(item.actionHref);
                    remove(item.id, true);
                  }}
                  style={({ pressed }) => [
                    styles.inner,
                    pressed && { opacity: 0.92 },
                    { flexDirection: 'row', alignItems: 'flex-start' },
                  ]}
                >
                  <View style={[styles.accent, { backgroundColor: border }]} />
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
                      <Text style={[styles.link, { color: border }]} numberOfLines={1}>
                        {item.actionLabel}
                      </Text>
                    ) : null}
                  </View>
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
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: 'hidden',
  },
  inner: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  accent: {
    width: 3,
    height: '100%',
    marginRight: 10,
    borderRadius: 6,
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
  },
});
