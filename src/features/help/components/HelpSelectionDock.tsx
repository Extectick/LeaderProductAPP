import React,{useLayoutEffect,useRef} from 'react';
import {Animated,Easing,Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';

/** Both surfaces remain mounted; only native transforms change during the handoff. */
export function HelpSelectionDock({active,canReply,canForward,onReply,onForward,children}:{active:boolean;canReply:boolean;canForward:boolean;onReply:()=>void;onForward:()=>void;children:React.ReactNode}){
 const c=useHelpTheme(),reduced=useHelpReducedMotion();
 const progress=useRef(new Animated.Value(active?1:0)).current;
 const height=useRef<number|undefined>(undefined);
 useLayoutEffect(()=>{
  progress.stopAnimation();
  if(reduced){progress.setValue(active?1:0);return;}
  const animation=Animated.timing(progress,{toValue:active?1:0,duration:220,easing:Easing.out(Easing.cubic),useNativeDriver:true,isInteraction:false});
  animation.start();return()=>animation.stop();
 },[active,reduced,progress]);
 const distance=Math.max(64,height.current??64)+12;
 return <View testID="help-selection-dock" style={{overflow:'hidden',minHeight:48}}>
  <Animated.View testID="help-selection-composer" pointerEvents={active?'none':'auto'} accessibilityElementsHidden={active} importantForAccessibility={active?'no-hide-descendants':'auto'} onLayout={event=>{if(!active)height.current=event.nativeEvent.layout.height;}} style={{...(active?{height:height.current}:{}),opacity:progress.interpolate({inputRange:[0,1],outputRange:[1,0]}),transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[0,distance]})}]}}>{children}</Animated.View>
  <Animated.View testID="help-selection-actions" pointerEvents={active?'auto':'none'} accessibilityElementsHidden={!active} importantForAccessibility={!active?'no-hide-descendants':'auto'} style={[StyleSheet.absoluteFill,{justifyContent:'center',opacity:progress,transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[distance,0]})}]}]}>
   <View style={{flexDirection:'row',justifyContent:'flex-end',gap:8,paddingHorizontal:12}}>
    {([{label:'Ответить',icon:'arrow-undo-outline',enabled:canReply,action:onReply},{label:'Переслать',icon:'arrow-redo-outline',enabled:canForward,action:onForward}] as const).map(item=><Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label==='Ответить'?'Ответить на выбранное сообщение':'Переслать выбранные сообщения'} disabled={!active||!item.enabled} onPress={item.action} style={{height:48,borderRadius:24,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:c.panel,opacity:item.enabled?1:.4}}><Ionicons name={item.icon} size={23} color={c.text}/><Text style={{color:c.text,fontSize:15}}>{item.label}</Text></Pressable>)}
   </View>
  </Animated.View>
 </View>;
}
