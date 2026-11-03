import React, { useContext, useEffect, useRef, useState } from 'react';
import {HelpVisualEffectsContext} from '../helpVisualEffects';
import { Animated, Image, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import {Gesture,GestureDetector,GestureHandlerRootView} from 'react-native-gesture-handler';
import Reanimated,{cancelAnimation,runOnJS,useAnimatedStyle,useSharedValue,withSpring,withTiming} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppEdgeBlur } from '@/components/ui/AppScreenBlur';
import { LinearGradient } from 'expo-linear-gradient';
import { useHelpTheme, useHelpReducedMotion } from '../helpTheme';
import { helpColor, helpInitials } from '../helpUiUtils';
import {helpTypingLabel,type HelpTypingUser} from '../helpTypingModel';
import { helpDevRef, helpDevState } from '../helpDiagnostics';

export type HelpIconName = keyof typeof Ionicons.glyphMap;
export function HelpIcon({ name, label, onPress, active, disabled, color, size = 22, rotation = 0, style }: { name: HelpIconName; label: string; onPress?: () => void; active?: boolean; disabled?: boolean; color?: string; size?: number; rotation?: number; style?: ViewStyle }) {
  const c = useHelpTheme(); const reduced = useHelpReducedMotion();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled:Boolean(disabled),selected:Boolean(active)}} disabled={disabled} onPress={onPress} style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.soft : 'transparent', opacity: disabled ? .38 : pressed ? .65 : 1, transform: [{ scale: pressed && !disabled && !reduced ? .96 : 1 }] }, style]}><Ionicons name={name} size={size} color={color ?? c.accentText} style={rotation ? {transform:[{rotate:`${rotation}deg`}]} : undefined} /></Pressable>;
}
export function HelpAvatar({ id, name, uri, size = 34, muted = false }: { id: number; name: string; uri?: string | null; size?: number; muted?: boolean }) {
  const [failedUri,setFailedUri]=useState<string|null>(null);
  return <View accessibilityLabel={name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: muted ? '#747D89' : helpColor(id), opacity:muted ? .7 : 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{uri&&uri!==failedUri ? <Image onError={()=>setFailedUri(uri)} source={{ uri }} style={{ width: size, height: size, ...(muted ? {filter:'grayscale(1)'} as any : {}) }} /> : <Text style={{ color: '#FFF', fontSize: size * .32, fontWeight: '600' }}>{helpInitials(name) || 'IT'}</Text>}</View>;
}
/** App headers and Help use the same material and edge falloff. */
export function HelpBlurSurface({target,edge='top'}:{target?:React.RefObject<View|null>;edge?:'top'|'bottom'}) {
  const c=useHelpTheme();
  const enabled=useContext(HelpVisualEffectsContext);
  return enabled ? <AppEdgeBlur target={target} edge={edge} intensity={14} featherSize={104} dark={c.dark} backgroundColor={c.background} testID="help-blur-surface"/> : null;
}
export function HelpDock({ children, onHeight, target, stableKeyboardLayout=false }: { children: React.ReactNode; onHeight?: (height: number) => void; target?: React.RefObject<View | null>; stableKeyboardLayout?:boolean }) {
  const c = useHelpTheme(); const insets = useSafeAreaInsets();
  const {width}=useWindowDimensions();
  // On Android, safe-area can briefly report navigation-bar space while the
  // IME is moving. Native already owns that movement; changing dock padding
  // in response adds a second layout jump. Capture the screen's resting inset.
  const restingInset=useRef({width,bottom:insets.bottom});
  if(restingInset.current.width!==width)restingInset.current={width,bottom:insets.bottom};
  const heightTimer=useRef<ReturnType<typeof setTimeout>|null>(null),measuredHeight=useRef(0),heightCallback=useRef(onHeight);
  heightCallback.current=onHeight;
  useEffect(()=>()=>{if(heightTimer.current)clearTimeout(heightTimer.current);},[]);
  const reportHeight=(height:number)=>{
    if(height<=0||!heightCallback.current)return;
    if(!stableKeyboardLayout||measuredHeight.current===0){measuredHeight.current=height;heightCallback.current(height);return;}
    measuredHeight.current=height;
    if(heightTimer.current)clearTimeout(heightTimer.current);
    // Native follows every layout frame. JS only needs the settled occlusion
    // for read visibility/search controls; do not rerender the chat at 60 Hz.
    heightTimer.current=setTimeout(()=>{heightTimer.current=null;heightCallback.current?.(measuredHeight.current);},60);
  };
  const [keyboardVisible, setKeyboardVisible] = useState(() => Boolean(Keyboard.isVisible?.()) && (Keyboard.metrics?.()?.height ?? 0) > 0);
  useEffect(() => {
    if(stableKeyboardLayout)return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', event => setKeyboardVisible(event.endCoordinates.height > 0));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, [stableKeyboardLayout]);
  useEffect(() => helpDevState({ keyboardVisible, keyboardHeight: Keyboard.metrics?.()?.height ?? 0 }), [keyboardVisible]);
  return <View ref={node => helpDevRef('dock', node)} onLayout={e => reportHeight(e.nativeEvent.layout.height)} style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: stableKeyboardLayout ? restingInset.current.bottom+8 : keyboardVisible ? 8 : insets.bottom + 8, position: 'relative' }}>
    <View testID="help-dock-backdrop" pointerEvents="none" style={[StyleSheet.absoluteFill, {top:-8}]}><HelpBlurSurface target={target}/></View>{children}
  </View>;
}
export function HelpPrimaryButton({ text, icon = 'add-outline', onPress, disabled, variant = 'dock' }: { text: string; icon?: HelpIconName; onPress: () => void; disabled?: boolean; variant?: 'dock'|'sheet' }) {
  const c = useHelpTheme(); const reduced = useHelpReducedMotion();
  return <Pressable accessibilityRole="button" accessibilityState={{disabled:Boolean(disabled)}} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ height: variant === 'dock' ? 48 : 44, borderRadius: variant === 'dock' ? 24 : 12, backgroundColor: disabled ? c.elevated : c.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed && !disabled ? .8 : 1, transform: [{ scale: pressed && !disabled && !reduced ? .96 : 1 }] })}><Ionicons name={icon} size={22} color={disabled ? c.muted : '#FFF'} /><Text style={{ color: disabled ? c.muted : '#FFF', fontSize: 14 }}>{text}</Text></Pressable>;
}
/** Isolated UI-thread panel: dragging never resizes or rerenders the chat. */
export function HelpSheet({title,children,onClose,scrollOffset=0,resizable=true}:{title:string;children:React.ReactNode;onClose:()=>void;scrollOffset?:number;resizable?:boolean}){
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),insets=useSafeAreaInsets(),window=useWindowDimensions();
  const maximum=Math.max(260,window.height-insets.top-24),padding=Math.max(24,insets.bottom+16);
  const [natural,setNatural]=useState(260),collapsed=Math.min(maximum,natural);
  const height=useSharedValue(collapsed),y=useSharedValue(collapsed),start=useSharedValue(collapsed),closing=useSharedValue(false);
  const latest=useRef(onClose);latest.current=onClose;
  const dismissed=React.useCallback(()=>latest.current(),[]);
  const close=React.useCallback(()=>{
    if(closing.value)return;closing.value=true;cancelAnimation(height);
    y.value=withTiming(height.value+padding,{duration:reduced?0:180},finished=>{if(finished)runOnJS(dismissed)();});
  },[closing,height,y,padding,reduced,dismissed]);
  useEffect(()=>{height.value=collapsed;y.value=withTiming(0,{duration:reduced?0:220});return()=>{cancelAnimation(y);cancelAnimation(height);};},[collapsed,height,y,reduced]);
  const motion=useAnimatedStyle(()=>({height:height.value,transform:[{translateY:y.value}]}));
  const pan=React.useMemo(()=>Gesture.Pan().withTestId('help-sheet-resize').enabled(scrollOffset<=0).maxPointers(1).activeOffsetY(resizable?[-8,8]:8).failOffsetX([-24,24])
    .onStart(()=>{if(closing.value)return;cancelAnimation(height);start.value=height.value;})
    .onUpdate(event=>{if(!closing.value)height.value=Math.max(80,Math.min(maximum,start.value-event.translationY));})
    .onEnd((event,success)=>{
      if(!success||closing.value)return;
      if(height.value<collapsed*.7||(event.translationY>24&&event.velocityY>900)){runOnJS(close)();return;}
      const next=height.value>(collapsed+maximum)/2||event.velocityY< -600?maximum:collapsed;
      height.value=withSpring(next,{damping:25,stiffness:280,mass:.8,overshootClamping:true});
    })
    .onFinalize((_,success)=>{if(!success&&!closing.value)height.value=withSpring(start.value,{damping:25,stiffness:280,mass:.8,overshootClamping:true});}),
    [scrollOffset,resizable,closing,height,start,maximum,collapsed,close]);
  return <Modal transparent animationType="none" onRequestClose={close} statusBarTranslucent><GestureHandlerRootView style={{flex:1}}><View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#00000057'}}>
    <Pressable accessibilityLabel="Закрыть" onPress={close} style={StyleSheet.absoluteFill}/>
    <GestureDetector gesture={pan}><Reanimated.View testID="help-sheet-surface" style={[{backgroundColor:c.panel,borderTopLeftRadius:22,borderTopRightRadius:22,paddingHorizontal:18,paddingBottom:padding,overflow:'hidden'},motion]}>
      <View style={{height:30,alignItems:'center',justifyContent:'center'}}><View style={{width:42,height:5,borderRadius:3,backgroundColor:c.muted,opacity:.45}}/></View>
      <View style={{flexDirection:'row',alignItems:'center',paddingBottom:14,minHeight:36}}><Text style={{flex:1,color:c.text,fontSize:18,fontWeight:'600',paddingRight:34}}>{title}</Text><HelpIcon name="close-outline" label="Закрыть" onPress={close} size={22} style={{position:'absolute',right:-6,top:-7}}/></View>
      <View onLayout={event=>setNatural(Math.max(260,event.nativeEvent.layout.height+80+padding))}>{children}</View>
    </Reanimated.View></GestureDetector>
  </View></GestureHandlerRootView></Modal>;
}
export function HelpTyping({ text, users, color, compact=false }: { text?: string; users?: readonly HelpTypingUser[]; color?: string; compact?:boolean }) {
  const c=useHelpTheme(); const reduced=useHelpReducedMotion(); const phases=useRef([0,1,2].map(()=>new Animated.Value(0))).current;
  useEffect(()=>{if(reduced){phases.forEach(phase=>phase.setValue(0));return;}const loops=phases.map((phase,index)=>Animated.loop(Animated.sequence([Animated.delay(index*160),Animated.timing(phase,{toValue:1,duration:360,useNativeDriver:true}),Animated.timing(phase,{toValue:0,duration:360,useNativeDriver:true}),Animated.delay(480-index*160)])));loops.forEach(loop=>loop.start());return()=>loops.forEach(loop=>loop.stop());},[reduced]);
  const participants=users?[...new Map(users.map(user=>[user.userId,user])).values()].sort((a,b)=>a.userId-b.userId):[];
  const label=participants.length?helpTypingLabel(participants):text??'';
  const spoken=participants.length?helpTypingLabel(participants,true):label;
  if(!label)return null;
  const shown=participants.slice(0,3),size=compact?18:28,advance=compact?12:18,extra=participants.length-shown.length;
  const count=shown.length+(extra>0?1:0),width=count?size+(count-1)*advance:0;
  return <View testID="help-typing-indicator" accessible accessibilityLabel={spoken} accessibilityLiveRegion="polite" style={{flexDirection:'row',alignItems:'center',gap:compact?5:8,minWidth:0,minHeight:compact?20:40}}>
    {participants.length?<View testID="help-typing-avatars" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width,height:size,flexShrink:0}}>{shown.map((user,index)=><View testID={`help-typing-avatar-${user.userId}`} key={user.userId} style={{position:'absolute',left:index*advance,top:0,width:size,height:size,borderRadius:size/2,borderWidth:compact?1:2,borderColor:c.background,overflow:'hidden',backgroundColor:c.background,zIndex:index}}><HelpAvatar id={user.userId} name={user.name} uri={user.avatarUrl} size={size-(compact?2:4)}/></View>)}{extra>0?<View testID="help-typing-more" style={{position:'absolute',left:shown.length*advance,width:size,height:size,borderRadius:size/2,backgroundColor:c.soft,borderWidth:1,borderColor:c.background,alignItems:'center',justifyContent:'center',zIndex:shown.length}}><Text style={{fontSize:compact?8:10,color:c.accentText,fontWeight:'600'}}>+{extra}</Text></View>:null}</View>:null}
    <View style={{flexDirection:'row',alignItems:'center',gap:5,flexShrink:1,minWidth:0}}><View accessible={false} style={{flexDirection:'row',alignItems:'center',height:14,gap:2}}>{phases.map((phase,index)=><Animated.View key={index} style={{width:3,height:3,borderRadius:2,backgroundColor:color??c.accentText,opacity:reduced ? .8 : phase.interpolate({inputRange:[0,1],outputRange:[.45,1]}),transform:[{translateY:phase.interpolate({inputRange:[0,1],outputRange:[0,-3]})}]}}/>)}</View><Text numberOfLines={1} style={{flexShrink:1,color:color??c.accentText,fontSize:compact?12:13,lineHeight:18}}>{label}</Text></View>
  </View>;
}
export function HelpNotice({ text, onDone }: { text: string; onDone: () => void }) {
  const c=useHelpTheme(); const reduced=useHelpReducedMotion(); const progress=useRef(new Animated.Value(0)).current; const [height,setHeight]=useState(38); const done=useRef(onDone);done.current=onDone;
  useEffect(()=>{let alive=true;Animated.timing(progress,{toValue:1,duration:reduced ? 0 : 260,useNativeDriver:true}).start();const timer=setTimeout(()=>Animated.timing(progress,{toValue:0,duration:reduced ? 0 : 260,useNativeDriver:true}).start(()=>{if(alive)done.current();}),2400);return()=>{alive=false;clearTimeout(timer);progress.stopAnimation();};},[text,reduced]);
  return <View pointerEvents="none" style={{overflow:'hidden',paddingHorizontal:14}}><Animated.View onLayout={e=>setHeight(e.nativeEvent.layout.height)} accessibilityLiveRegion="polite" style={{alignSelf:'center',maxWidth:'100%',flexDirection:'row',alignItems:'center',gap:9,borderRadius:15,paddingHorizontal:14,paddingVertical:10,backgroundColor:c.incoming,borderWidth:1,borderColor:c.line,marginBottom:10,opacity:progress,transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[height+16,0]})}]}}><View style={{width:5,height:5,borderRadius:3,backgroundColor:c.accentText}}/><Text style={{flexShrink:1,color:c.text,fontSize:12,lineHeight:17}}>{text}</Text></Animated.View></View>;
}
