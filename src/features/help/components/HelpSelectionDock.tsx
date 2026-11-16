import React,{useLayoutEffect,useRef,useState} from 'react';
import {Animated,Easing,Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';

/** Both surfaces remain mounted; only native transforms change during the handoff. */
export function HelpSelectionDock({active,canReply,canForward,onReply,onForward,children}:{active:boolean;canReply:boolean;canForward:boolean;onReply:()=>void;onForward:()=>void;children:React.ReactNode}){
 const c=useHelpTheme(),reduced=useHelpReducedMotion();
 const progress=useRef(new Animated.Value(active?1:0)).current;
 const replyProgress=useRef(new Animated.Value(canReply?1:0)).current;
 const [widths,setWidths]=useState({reply:136,forward:148});
 useLayoutEffect(()=>{
  replyProgress.stopAnimation();
  if(reduced){replyProgress.setValue(canReply?1:0);return;}
  const motion=Animated.timing(replyProgress,{toValue:canReply?1:0,duration:220,easing:Easing.out(Easing.cubic),useNativeDriver:true,isInteraction:false});
  motion.start();return()=>motion.stop();
 },[canReply,reduced,replyProgress]);
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
   <View testID="help-selection-buttons" style={{height:48,width:'100%'}}>
    {([{key:'reply',label:'Ответить',icon:'arrow-undo-outline',enabled:canReply,action:onReply},{key:'forward',label:'Переслать',icon:'arrow-redo-outline',enabled:canForward,action:onForward}] as const).map(item=><Animated.View key={item.key} testID={`help-selection-${item.key}-motion`} pointerEvents={item.enabled?'auto':'none'} accessibilityElementsHidden={!item.enabled} importantForAccessibility={!item.enabled?'no-hide-descendants':'auto'} style={{position:'absolute',left:'50%',top:0,opacity:item.key==='reply'?replyProgress:1,transform:item.key==='reply'?[{translateX:-(widths.reply+8+widths.forward)/2},{translateY:replyProgress.interpolate({inputRange:[0,1],outputRange:[64,0]})}]:[{translateX:replyProgress.interpolate({inputRange:[0,1],outputRange:[-widths.forward/2,(widths.reply+8-widths.forward)/2]})}]}}>
     <Pressable onLayout={event=>{const width=event.nativeEvent.layout.width;if(width>0)setWidths(previous=>Math.abs(previous[item.key]-width)>.5?{...previous,[item.key]:width}:previous);}} accessibilityRole="button" accessibilityLabel={item.key==='reply'?'Ответить на выбранное сообщение':'Переслать выбранные сообщения'} disabled={!active||!item.enabled} onPress={item.action} style={{height:48,borderRadius:24,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:c.panel,opacity:item.key==='forward'&&!item.enabled ? .4 : 1}}><Ionicons name={item.icon} size={23} color={c.text}/><Text style={{color:c.text,fontSize:15}}>{item.label}</Text></Pressable>
    </Animated.View>)}
   </View>
  </Animated.View>
 </View>;
}
