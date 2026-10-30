import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { NotificationDeadlines } from '@/utils/notificationDeadlines';
import { useNotificationViewport } from '@/context/NotificationViewportContext';
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

const palette: Record<NotificationType, { bg: string; text: string; border: string; icon: string; iconTint: string }> = {
  info: { bg: '#E8F1FF', text: '#0B1A3A', border: '#A7C4FF', icon: 'information-circle', iconTint: '#1D4ED8' },
  success: { bg: '#E7FAEF', text: '#052E16', border: '#86E5B0', icon: 'checkmark-circle', iconTint: '#0E9F6E' },
  warning: { bg: '#FFF7E8', text: '#3A2305', border: '#FDD38A', icon: 'warning', iconTint: '#D97706' },
  error: { bg: '#FFECEC', text: '#3B0A0A', border: '#FCA5A5', icon: 'alert-circle', iconTint: '#DC2626' },
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
  const itemsRef=useRef(items);itemsRef.current=items;
  const presented=useRef(new Set<string>());
  const removeRef=useRef<(id:string)=>void>(()=>{});
  const deadlines=useMemo(()=>new NotificationDeadlines(id=>removeRef.current(id)),[]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { headerBottomOffset } = useNotificationViewport();

  const isTouchWeb =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    (typeof (window as any).ontouchstart !== 'undefined' ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
  const swipeEnabled = Platform.OS !== 'web' || isTouchWeb;
  const showClose = Platform.OS === 'web' && !isTouchWeb;
  const maxWidth = width >= 780 ? 560 : width >= 420 ? width - 26 : width - 14;

  const remove = useCallback((id: string, immediate = false) => {
    deadlines.cancel(id);presented.current.delete(id);
    setItems((prev) => {
      const idx = prev.findIndex((n) => n.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      const [target] = next.splice(idx, 1);
      if (target && !immediate) {
        Animated.parallel([
          Animated.timing(target.anim, {
            toValue: 0,
            duration: 220,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(target.dragY, {
            toValue: -18,
            duration: 220,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          markNotificationClosed(id);
          setItems((p) => p.filter((n) => n.id !== id));
        });
        return prev;
      }
      markNotificationClosed(id);
      return next;
    });
  }, [deadlines]);
  removeRef.current=remove;

  const add = useCallback(
    (notification: Required<NotificationPayload>) => {
      const anim = new Animated.Value(0);
      const dragY = new Animated.Value(0);
      const normalized: ActiveNotification = { ...notification, anim, dragY };
      const replaced=itemsRef.current.filter(item=>item.id===notification.id || notification.variant==='message'&&notification.groupKey&&item.groupKey===notification.groupKey);
      replaced.forEach(item=>{deadlines.cancel(item.id);if(item.id!==notification.id)markNotificationClosed(item.id);presented.current.delete(item.id);});
      const keep=itemsRef.current.filter(item=>!replaced.includes(item));
      const oldIndex=itemsRef.current.findIndex(item=>replaced.includes(item));
      const insertion=oldIndex>=0?Math.min(oldIndex,keep.length):notification.variant==='message'?keep.length:0;
      const ordered=[...keep];ordered.splice(insertion,0,normalized);const next=ordered.slice(0,4);
      ordered.slice(4).forEach(item=>{deadlines.cancel(item.id);markNotificationClosed(item.id);});
      itemsRef.current=next;setItems(next);
      if(notification.variant!=='message')Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      if(notification.variant!=='message')deadlines.start(notification.id,notification.durationMs);
    },
    [deadlines]
  );

  useEffect(() => {
    const unsub = subscribeToNotifications(add);
    const unsubDismiss = subscribeToNotificationDismiss((id) => remove(id, true));
    return () => {
      unsub();
      unsubDismiss();deadlines.clear();
    };
  }, [add, remove,deadlines]);

  const containerStyle = useMemo(
    () => [
      styles.host,
      {
        paddingTop: items.some(item=>item.variant==='message')?Math.max(insets.top,8)+6:Math.max(headerBottomOffset + 8, Math.max(insets.top, Platform.OS === 'web' ? 10 : 6) + 6),
      },
    ],
    [headerBottomOffset, insets.top,items]
  );

  return (
    <View style={{ flex: 1 }}>
      {children}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View pointerEvents="box-none" style={containerStyle}>
          {items.filter(item=>item.variant!=='message'||item.id===items.find(row=>row.variant==='message')?.id).map((item, index) => {
            const messageVariant=item.variant==='message';
            const colors = palette[item.type] || palette.info;
            const bg = item.backgroundColor || colors.bg;
            const border = item.borderColor || colors.border;
            const textColor = item.textColor || colors.text;
            const iconName = item.icon || colors.icon;
            const iconTint = item.borderColor ? border : colors.iconTint;
            const iconBg = withOpacity(iconTint, 0.13);
            const entryTranslate = item.anim.interpolate({
              inputRange: [0, 1],
              outputRange: [messageVariant?-110:-34, 0],
            });
            const translateY = Animated.add(entryTranslate, item.dragY);
            const scale = item.anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
            const panResponder = PanResponder.create({
              onMoveShouldSetPanResponder: (_event, gesture) => {
                if (!swipeEnabled) return false;
                const dy = gesture.dy;
                const dx = gesture.dx;
                return dy < -8 && Math.abs(dy) > Math.abs(dx);
              },
              onPanResponderGrant:()=>deadlines.pause(item.id),
              onPanResponderTerminate:()=>{deadlines.resume(item.id);Animated.spring(item.dragY,{toValue:0,useNativeDriver:true}).start();},
              onPanResponderMove: (_event, gesture) => {
                if (!swipeEnabled) return;
                const next = Math.max(-90, Math.min(0, gesture.dy));
                item.dragY.setValue(next);
              },
              onPanResponderRelease: (_event, gesture) => {
                if (!swipeEnabled) return;
                const shouldDismiss = gesture.dy < -32 || gesture.vy < -0.65;
                if (shouldDismiss) {
                  dismissNotification(item.id);
                  return;
                }
                deadlines.resume(item.id);
                Animated.spring(item.dragY, {
                  toValue: 0,
                  useNativeDriver: true,
                  damping: 18,
                  stiffness: 220,
                }).start();
              },
            });

            return (
              <Animated.View
                key={item.id}
                testID={messageVariant?'help-message-banner':undefined}
                onLayout={()=>{if(!presented.current.has(item.id)){presented.current.add(item.id);if(messageVariant){Animated.timing(item.anim,{toValue:1,duration:300,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();deadlines.start(item.id,item.durationMs);}item.onPresented();}}}
                style={[
                  styles.card,
                  messageVariant?{borderRadius:24,borderWidth:StyleSheet.hairlineWidth,width:'100%'}:null,
                  {
                    transform: [{ translateY }, { scale }],
                    opacity: item.anim,
                    backgroundColor: bg,
                    borderColor: border,
                    maxWidth,
                    marginTop: index === 0 ? 0 : 8,
                  },
                ]}
                {...(swipeEnabled ? panResponder.panHandlers : {})}
              >
                <Pressable
                  accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.message}`}
                  onPressIn={()=>deadlines.pause(item.id)} onPressOut={()=>deadlines.resume(item.id)}
                  onPress={() => {
                    if (item.onPress) item.onPress();
                    if (item.actionHref) openNotificationLink(item.actionHref);
                    dismissNotification(item.id);
                  }}
                  style={({ pressed }) => [styles.inner, pressed ? styles.pressed : null]}
                >
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={[styles.avatar,messageVariant?{width:42,height:42,borderRadius:21}:null]} />
                  ) : (
                    <View style={[styles.iconWrap, { backgroundColor: item.avatarColor||iconBg },messageVariant?{width:42,height:42,borderRadius:21}:null]}>
                      <Ionicons name={iconName as any} size={messageVariant?23:20} color={messageVariant?'#FFF':iconTint} />
                    </View>
                  )}
                  <View style={styles.content}>
                    {item.title ? (
                      <Text style={[styles.title, { color: textColor },messageVariant?{fontWeight:'600'}:null]} numberOfLines={messageVariant?1:2}>
                        {item.title}
                      </Text>
                    ) : null}
                    <Text style={[styles.message, { color: textColor },messageVariant?{fontWeight:'400',fontSize:14,lineHeight:20,opacity:.85}:null]} numberOfLines={messageVariant?2:4}>
                      {item.message}
                    </Text>
                    {item.actionLabel ? (
                      <Text style={[styles.link, { color: iconTint }]} numberOfLines={2}>
                        {item.actionLabel}
                      </Text>
                    ) : null}
                  </View>
                  {showClose ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Закрыть уведомление"
                      onPress={(event) => {
                        (event as any)?.stopPropagation?.();
                        dismissNotification(item.id);
                      }}
                      style={({ pressed }) => [styles.closeBtn, { backgroundColor: iconBg }, pressed ? styles.closePressed : null]}
                    >
                      <Ionicons name="close" size={16} color={iconTint} />
                    </Pressable>
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
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    overflow: 'hidden',
  },
  inner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  pressed: {
    opacity: 0.94,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontWeight: '900',
    fontSize: 15,
    lineHeight: 20,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  link: {
    marginTop: 2,
    fontWeight: '800',
    fontSize: 13,
    textDecorationLine: 'underline',
    flexShrink: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: {
    opacity: 0.72,
  },
});
