import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Keyboard, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useHelpTheme, useHelpReducedMotion } from '../helpTheme';
import { helpColor, helpInitials } from '../helpUiUtils';

export type HelpIconName = keyof typeof Ionicons.glyphMap;
export function HelpIcon({ name, label, onPress, active, disabled, color, size = 22, style }: { name: HelpIconName; label: string; onPress?: () => void; active?: boolean; disabled?: boolean; color?: string; size?: number; style?: ViewStyle }) {
  const c = useHelpTheme(); const reduced = useHelpReducedMotion();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled:Boolean(disabled),selected:Boolean(active)}} disabled={disabled} onPress={onPress} style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.soft : 'transparent', opacity: disabled ? .38 : pressed ? .65 : 1, transform: [{ scale: pressed && !disabled && !reduced ? .96 : 1 }] }, style]}><Ionicons name={name} size={size} color={color ?? c.accentText} /></Pressable>;
}
export function HelpAvatar({ id, name, uri, size = 34, muted = false }: { id: number; name: string; uri?: string | null; size?: number; muted?: boolean }) {
  return <View accessibilityLabel={name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: muted ? '#747D89' : helpColor(id), opacity:muted ? .7 : 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{uri ? <Image source={{ uri }} style={{ width: size, height: size, ...(muted ? {filter:'grayscale(1)'} as any : {}) }} /> : <Text style={{ color: '#FFF', fontSize: size * .32, fontWeight: '600' }}>{helpInitials(name) || 'IT'}</Text>}</View>;
}
export function HelpDock({ children, onHeight, target }: { children: React.ReactNode; onHeight?: (height: number) => void; target?: React.RefObject<View | null> }) {
  const c = useHelpTheme(); const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return <View onLayout={e => onHeight?.(e.nativeEvent.layout.height)} style={{ paddingHorizontal: 4, paddingTop: 8, paddingBottom: keyboardVisible ? 8 : insets.bottom + 8, position: 'relative' }}>
    <View testID="help-dock-backdrop" pointerEvents="none" style={[StyleSheet.absoluteFill, { top: -8 }]}>{Platform.OS === 'web' ? <View style={[StyleSheet.absoluteFill, {backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)',maskImage:'linear-gradient(to bottom, transparent 0, #00000018 10px, #00000080 24px, #000 40px)',WebkitMaskImage:'linear-gradient(to bottom, transparent 0, #00000018 10px, #00000080 24px, #000 40px)'} as any]} /> : <>{[.02,.07,.16,.3,.47,.64,.79,.94].map((opacity,i)=><BlurView key={i} blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={30} tint={c.dark ? 'dark' : 'light'} style={{position:'absolute',top:i*5,left:0,right:0,height:5,opacity}} />)}<BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={30} tint={c.dark ? 'dark' : 'light'} style={{position:'absolute',top:40,left:0,right:0,bottom:0}} /></>}</View>{children}
  </View>;
}
export function HelpPrimaryButton({ text, icon = 'add-outline', onPress, disabled, variant = 'dock' }: { text: string; icon?: HelpIconName; onPress: () => void; disabled?: boolean; variant?: 'dock'|'sheet' }) {
  const c = useHelpTheme(); const reduced = useHelpReducedMotion();
  return <Pressable accessibilityRole="button" accessibilityState={{disabled:Boolean(disabled)}} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ height: variant === 'dock' ? 48 : 44, borderRadius: variant === 'dock' ? 20 : 12, backgroundColor: disabled ? c.elevated : c.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed && !disabled ? .8 : 1, transform: [{ scale: pressed && !disabled && !reduced ? .96 : 1 }] })}><Ionicons name={icon} size={22} color={disabled ? c.muted : '#FFF'} /><Text style={{ color: disabled ? c.muted : '#FFF', fontSize: 14 }}>{text}</Text></Pressable>;
}
/** Sheets drag from their content, not just the handle. Scrollable children yield until at top. */
export function HelpSheet({ title, children, onClose, scrollOffset = 0 }: { title: string; children: React.ReactNode; onClose: () => void; scrollOffset?: number }) {
  const c = useHelpTheme(); const reduced=useHelpReducedMotion(); const insets = useSafeAreaInsets(); const y = useRef(new Animated.Value(260)).current;
  const callbacks=useRef({onClose,reduced});callbacks.current={onClose,reduced};
  useEffect(()=>{Animated.timing(y,{toValue:0,duration:reduced ? 0 : 180,useNativeDriver:true}).start();},[reduced]);
  const close = () => Animated.timing(y, { toValue: 700, duration: callbacks.current.reduced ? 0 : 180, useNativeDriver: true }).start(()=>callbacks.current.onClose());
  const offset = useRef(scrollOffset); offset.current = scrollOffset;
  const pan = useRef(PanResponder.create({ onMoveShouldSetPanResponder: (_, g) => offset.current <= 0 && g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5, onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)), onPanResponderRelease: (_, g) => g.dy > 90 || g.vy > 1.1 ? close() : Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 22 }).start() })).current;
  return <Modal transparent animationType="none" onRequestClose={close} statusBarTranslucent><View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#00000057'}}><Pressable accessibilityLabel="Закрыть" onPress={close} style={StyleSheet.absoluteFill}/><Animated.View testID="help-sheet-surface" {...pan.panHandlers} style={{minHeight:260,backgroundColor:c.dark ? c.panel : c.headerSurface,borderTopLeftRadius:22,borderTopRightRadius:22,paddingHorizontal:18,paddingBottom:Math.max(24,insets.bottom+16),transform:[{translateY:y}]}}><View style={{height:30,alignItems:'center',justifyContent:'center'}}><View style={{width:42,height:5,borderRadius:3,backgroundColor:'#C9C9C4'}}/></View><View style={{flexDirection:'row',alignItems:'center',paddingBottom:14,minHeight:36}}><Text style={{flex:1,color:c.text,fontSize:18,fontWeight:'900',paddingRight:34}}>{title}</Text><HelpIcon name="close-outline" label="Закрыть" onPress={close} size={22} style={{position:'absolute',right:-6,top:-7}}/></View>{children}</Animated.View></View></Modal>;
}
export function HelpTyping({ text, color }: { text: string; color?: string }) {
  const c=useHelpTheme(); const reduced=useHelpReducedMotion(); const phases=useRef([0,1,2].map(()=>new Animated.Value(0))).current;
  useEffect(()=>{if(reduced){phases.forEach(phase=>phase.setValue(0));return;}const loops=phases.map((phase,index)=>Animated.loop(Animated.sequence([Animated.delay(index*160),Animated.timing(phase,{toValue:1,duration:360,useNativeDriver:true}),Animated.timing(phase,{toValue:0,duration:360,useNativeDriver:true}),Animated.delay(480-index*160)])));loops.forEach(loop=>loop.start());return()=>loops.forEach(loop=>loop.stop());},[reduced]);
  return <View accessibilityLabel={text} accessibilityLiveRegion="polite" style={{flexDirection:'row',alignItems:'center',gap:5}}><View style={{flexDirection:'row',alignItems:'center',height:14,gap:2}}>{phases.map((phase,index)=><Animated.View key={index} style={{width:3,height:3,borderRadius:2,backgroundColor:color??c.accentText,opacity:reduced ? .8 : phase.interpolate({inputRange:[0,1],outputRange:[.45,1]}),transform:[{translateY:phase.interpolate({inputRange:[0,1],outputRange:[0,-3]})}]}}/>)}</View><Text numberOfLines={1} style={{flexShrink:1,color:color??c.accentText,fontSize:12}}>{text}</Text></View>;
}
export function HelpNotice({ text, onDone }: { text: string; onDone: () => void }) {
  const c=useHelpTheme(); const reduced=useHelpReducedMotion(); const progress=useRef(new Animated.Value(0)).current; const [height,setHeight]=useState(38); const done=useRef(onDone);done.current=onDone;
  useEffect(()=>{let alive=true;Animated.timing(progress,{toValue:1,duration:reduced ? 0 : 260,useNativeDriver:true}).start();const timer=setTimeout(()=>Animated.timing(progress,{toValue:0,duration:reduced ? 0 : 260,useNativeDriver:true}).start(()=>{if(alive)done.current();}),2400);return()=>{alive=false;clearTimeout(timer);progress.stopAnimation();};},[text,reduced]);
  return <View pointerEvents="none" style={{overflow:'hidden',paddingHorizontal:14}}><Animated.View onLayout={e=>setHeight(e.nativeEvent.layout.height)} accessibilityLiveRegion="polite" style={{alignSelf:'center',maxWidth:'100%',flexDirection:'row',alignItems:'center',gap:9,borderRadius:15,paddingHorizontal:14,paddingVertical:10,backgroundColor:c.incoming,borderWidth:1,borderColor:c.line,marginBottom:10,opacity:progress,transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[height+16,0]})}]}}><View style={{width:5,height:5,borderRadius:3,backgroundColor:c.accentText}}/><Text style={{flexShrink:1,color:c.text,fontSize:12,lineHeight:17}}>{text}</Text></Animated.View></View>;
}
