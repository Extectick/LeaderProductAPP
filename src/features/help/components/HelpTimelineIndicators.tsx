import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { helpDate } from '../helpUiUtils';
import { HELP_COMPOSER_ACTION_SIZE } from '../helpLayout';

export function HelpDateSeparator({ date, onPress, compact = false }: { date: string; onPress?: () => void; compact?: boolean }) {
  const c = useHelpTheme();
  const label = helpDate(date);
  const pill = <Text accessibilityRole={onPress ? undefined : 'header'} style={{ color: c.muted, backgroundColor: c.panel, fontSize: 11, lineHeight: 16, fontWeight: '500', paddingHorizontal: 11, paddingVertical: 4, borderRadius: 12 }}>{label}</Text>;
  return <View testID="help-date-separator" style={{ alignItems: 'center', justifyContent: 'center', minHeight: compact ? 24 : 44, paddingHorizontal: 16 }}>
    {onPress ? <Pressable testID="help-date-jump" accessibilityRole="button" accessibilityLabel={`Перейти к началу сообщений за ${label.toLocaleLowerCase('ru-RU')}`} onPress={onPress} hitSlop={compact ? {bottom:20,left:10,right:10} : undefined} style={({pressed})=>({minWidth:44,minHeight:compact ? 24 : 44,alignItems:'center',justifyContent:'center',opacity:pressed ? .65 : 1})}>{pill}</Pressable> : pill}
  </View>;
}

export function HelpUnreadSeparator({ count }: { count?: number }) {
  const c = useHelpTheme();
  const label = count && count > 0 ? `Непрочитанные сообщения: ${count}` : 'Непрочитанные сообщения';
  return <View testID="help-unread-separator" accessible accessibilityRole="header" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
    <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.accentText, opacity: .45 }} />
    <Text style={{ color: c.accentText, fontSize: 12, lineHeight: 18, fontWeight: '500', flexShrink: 1, textAlign: 'center' }}>Непрочитанные сообщения</Text>
    <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.accentText, opacity: .45 }} />
  </View>;
}

export function HelpJumpToLatest({ onPress, count = 0, loading = false, visible = true, style }: { onPress: () => void; count?: number; loading?: boolean; visible?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useHelpTheme();
  const reduced = useHelpReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    progress.stopAnimation();
    if (reduced) { progress.setValue(visible ? 1 : 0); setMounted(visible); return; }
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, { toValue: visible ? 1 : 0, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true, isInteraction: false });
    animation.start(({ finished }) => { if (finished && !visible && current === generation.current) setMounted(false); });
    return () => animation.stop();
  }, [visible, reduced, progress]);
  const unread = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (!mounted) return null;
  return <Animated.View testID="help-jump-to-latest-motion" pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({inputRange:[0,1],outputRange:[80,0]}) }, { scale: progress.interpolate({inputRange:[0,1],outputRange:[.7,1]}) }] }]}><Pressable testID="help-jump-to-latest" accessibilityRole="button" accessibilityLabel={unread ? `К последним сообщениям. Новых: ${unread}` : 'К последним сообщениям'} accessibilityState={{ busy: loading, disabled: loading || !visible }} disabled={loading || !visible} onPress={onPress} hitSlop={3} style={({ pressed }) => ({ width: HELP_COMPOSER_ACTION_SIZE, height: HELP_COMPOSER_ACTION_SIZE, borderRadius: HELP_COMPOSER_ACTION_SIZE / 2, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: .12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, opacity: pressed ? .8 : 1, transform: [{ scale: pressed && !reduced ? .96 : 1 }] })}>
    {loading && !reduced ? <ActivityIndicator size="small" color={c.accentText} /> : <Ionicons name="chevron-down" size={22} color={c.accentText} accessible={false} />}
    {unread > 0 ? <View pointerEvents="none" style={{ position: 'absolute', top: -7, alignSelf: 'center', minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.background }}><Text style={{ color: '#FFF', fontSize: 10, lineHeight: 14, fontWeight: '700' }}>{unread > 99 ? '99+' : unread}</Text></View> : null}
  </Pressable></Animated.View>;
}

export function HelpHistoryStatus({ loading = false, offline = false, error, onRetry }: { loading?: boolean; offline?: boolean; error?: string | null; onRetry?: () => void }) {
  const c = useHelpTheme();
  const reduced = useHelpReducedMotion();
  if (!loading && !offline && !error) return null;
  return <View testID="help-history-status" style={{ minHeight: 44, paddingHorizontal: 16, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
    {loading && !reduced ? <ActivityIndicator size="small" color={c.accentText} /> : <Ionicons name={offline ? 'cloud-offline-outline' : error ? 'alert-circle-outline' : 'time-outline'} size={17} color={error ? c.danger : c.muted} accessible={false} />}
    <Text accessibilityLiveRegion="polite" style={{ color: error ? c.danger : c.muted, fontSize: 12, lineHeight: 18, flexShrink: 1 }}>{error || (offline ? 'Нет подключения' : 'Загрузка сообщений…')}</Text>
    {error && onRetry && !loading ? <Pressable accessibilityRole="button" accessibilityLabel="Повторить загрузку сообщений" onPress={onRetry} style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }}><Text style={{ color: c.accentText, fontWeight: '500', fontSize: 12 }}>Повторить</Text></Pressable> : null}
  </View>;
}
