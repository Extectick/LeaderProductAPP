import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Modal, PanResponder, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useHelpTheme, type HelpTheme } from '../helpTheme';
import { helpColor, helpInitials } from '../helpUiUtils';

export type HelpIconName = keyof typeof Ionicons.glyphMap;
export function HelpIcon({ name, label, onPress, active, disabled, color, size = 22, style }: { name: HelpIconName; label: string; onPress?: () => void; active?: boolean; disabled?: boolean; color?: string; size?: number; style?: ViewStyle }) {
  const c = useHelpTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.elevated : 'transparent', opacity: disabled ? .35 : pressed ? .65 : 1, transform: [{ scale: pressed && !disabled ? .94 : 1 }] }, style]}><Ionicons name={name} size={size} color={color ?? c.accentText} /></Pressable>;
}
export function HelpAvatar({ id, name, uri, size = 34 }: { id: number; name: string; uri?: string | null; size?: number }) {
  return <View accessibilityLabel={name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: helpColor(id), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{uri ? <Image source={{ uri }} style={{ width: size, height: size }} /> : <Text style={{ color: '#FFF', fontSize: size * .32, fontWeight: '700' }}>{helpInitials(name) || 'IT'}</Text>}</View>;
}
export function HelpDock({ children, onHeight, target }: { children: React.ReactNode; onHeight?: (height: number) => void; target?: React.RefObject<View | null> }) {
  const c = useHelpTheme(); const insets = useSafeAreaInsets();
  return <View onLayout={e => onHeight?.(e.nativeEvent.layout.height)} style={{ paddingHorizontal: 4, paddingTop: 8, paddingBottom: Math.max(8, insets.bottom), position: 'relative' }}>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: -32 }]}>{[8, 16, 25, 35].map((intensity, i) => <BlurView key={intensity} blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={intensity} tint={c.dark ? 'dark' : 'light'} style={{ position: 'absolute', top: i * 8, left: 0, right: 0, ...(i === 3 ? { bottom: 0 } : { height: 8 }), opacity: (i + 1) / 4 }} />)}</View>
    <LinearGradient pointerEvents="none" colors={c.dark ? ['#151D2300', '#151D23E8', '#151D23'] : ['#F4F7FA00', '#F4F7FAE8', '#F4F7FA']} locations={[0, .45, 1]} style={[StyleSheet.absoluteFill, { top: -32 }]} />{children}
  </View>;
}
export function HelpPrimaryButton({ text, icon = 'add-outline', onPress, disabled }: { text: string; icon?: HelpIconName; onPress: () => void; disabled?: boolean }) {
  const c = useHelpTheme();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => ({ height: 48, borderRadius: 20, backgroundColor: disabled ? c.elevated : c.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? .8 : 1, transform: [{ scale: pressed ? .985 : 1 }] })}><Ionicons name={icon} size={23} color={disabled ? c.muted : '#FFF'} /><Text style={{ color: disabled ? c.muted : '#FFF', fontSize: 16, fontWeight: '600' }}>{text}</Text></Pressable>;
}
/** Sheets drag from their content, not just the handle. Scrollable children yield until at top. */
export function HelpSheet({ title, children, onClose, scrollOffset = 0 }: { title: string; children: React.ReactNode; onClose: () => void; scrollOffset?: number }) {
  const c = useHelpTheme(); const insets = useSafeAreaInsets(); const y = useRef(new Animated.Value(0)).current;
  const close = () => Animated.timing(y, { toValue: 700, duration: 180, useNativeDriver: true }).start(onClose);
  const offset = useRef(scrollOffset); offset.current = scrollOffset;
  const pan = useRef(PanResponder.create({ onMoveShouldSetPanResponder: (_, g) => offset.current <= 0 && g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5, onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)), onPanResponderRelease: (_, g) => g.dy > 90 || g.vy > 1.1 ? close() : Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 22 }).start() })).current;
  return <Modal transparent animationType="fade" onRequestClose={close} statusBarTranslucent><View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0007' }}><Pressable accessibilityLabel="Закрыть" onPress={close} style={StyleSheet.absoluteFill} /><Animated.View {...pan.panHandlers} style={{ backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Math.max(24, insets.bottom + 16), transform: [{ translateY: y }] }}><View style={{ width: 42, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: c.muted, marginBottom: 22 }} /><View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}><Text style={{ flex: 1, color: c.text, fontSize: 19, fontWeight: '700' }}>{title}</Text><HelpIcon name="close-outline" label="Закрыть" onPress={close} /></View>{children}</Animated.View></View></Modal>;
}
export function HelpTyping({ text, color }: { text: string; color?: string }) {
  const [dots, setDots] = useState(1); const c = useHelpTheme();
  useEffect(() => { const id = setInterval(() => setDots(n => n % 3 + 1), 450); return () => clearInterval(id); }, []);
  return <Text numberOfLines={1} accessibilityLiveRegion="polite" style={{ color: color ?? c.accentText, fontSize: 13 }}>{text}{'.'.repeat(dots)}</Text>;
}
export function HelpNotice({ text, onDone }: { text: string; onDone: () => void }) {
  const c = useHelpTheme(); const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => { let disposed = false; let timer: ReturnType<typeof setTimeout>; void AccessibilityInfo.isReduceMotionEnabled().then(reduced => { if (disposed) return; Animated.timing(progress, { toValue: 1, duration: reduced ? 0 : 180, useNativeDriver: true }).start(); timer = setTimeout(() => Animated.timing(progress, { toValue: 0, duration: reduced ? 0 : 180, useNativeDriver: true }).start(onDone), 2400); }); return () => { disposed = true; clearTimeout(timer); }; }, [text]);
  return <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={{ alignSelf: 'center', maxWidth: '90%', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: c.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, marginBottom: 8, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}><Text style={{ color: c.text, textAlign: 'center', fontSize: 13 }}>{text}</Text></Animated.View>;
}
