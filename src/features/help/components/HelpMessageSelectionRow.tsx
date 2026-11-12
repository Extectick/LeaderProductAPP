import React,{useCallback,useLayoutEffect,useRef,useState} from 'react';
import {Animated,Easing,Pressable,StyleSheet,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';

export type HelpMessageSelectionRowProps={
 messageId:number;active:boolean;selected:boolean;incoming:boolean;
 onToggle:(messageId:number)=>void;onStart:(messageId:number)=>void;children:React.ReactNode;
};

/** Keep outgoing alignment; reserve bounds for wide incoming content while sliding. */
export function HelpMessageSelectionRow(props:HelpMessageSelectionRowProps){
 const {messageId,active,selected,incoming,children}=props;
 const c=useHelpTheme(),reduced=useHelpReducedMotion();
 const latest=useRef(props);latest.current=props;
 const progress=useRef(new Animated.Value(active?1:0)).current;
 const previousActive=useRef(active),[rowWidth,setRowWidth]=useState(0);
 useLayoutEffect(()=>{
  if(previousActive.current===active){if(reduced)progress.setValue(active?1:0);return;}
  previousActive.current=active;progress.stopAnimation();
  if(reduced){progress.setValue(active?1:0);return;}
  const motion=Animated.timing(progress,{toValue:active?1:0,duration:180,easing:Easing.out(Easing.cubic),useNativeDriver:true,isInteraction:false});
  motion.start();return()=>motion.stop();
 },[active,reduced,progress]);
 const toggle=useCallback(()=>{const value=latest.current;if(value.messageId===messageId&&value.active)value.onToggle(messageId);},[messageId]);
 const start=useCallback(()=>{const value=latest.current;if(value.messageId===messageId&&!value.active)value.onStart(messageId);},[messageId]);
 return <View testID={`help-message-selection-row-${messageId}`} onLayout={event=>{const width=event.nativeEvent.layout.width;setRowWidth(previous=>Math.abs(previous-width)>.5?width:previous);}} style={styles.row}>
  {active&&selected?<View testID="help-message-selection-tint" pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:c.accent,opacity:.16}]}/>:null}
  <Pressable testID="help-message-selection-long-press" accessible={false} disabled={active} onLongPress={active?undefined:start} delayLongPress={500} style={styles.row}>
   <Animated.View testID="help-message-selection-content" pointerEvents={active?'none':'auto'} accessibilityElementsHidden={active} importantForAccessibility={active?'no-hide-descendants':'auto'}
    style={{width:'100%',maxWidth:active&&incoming&&rowWidth>36?rowWidth-36:undefined,transform:[{translateX:incoming?progress.interpolate({inputRange:[0,1],outputRange:[0,36]}):0}]}}>{children}</Animated.View>
  </Pressable>
  <Animated.View testID="help-message-selection-checkbox" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
   style={[styles.checkboxPosition,{opacity:progress,transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[-12,0]})}]}]}>
   <View style={[styles.checkbox,{backgroundColor:selected?c.green:'transparent'}]}>{selected?<Ionicons name="checkmark" size={20} color="#FFFFFF" accessible={false}/>:null}</View>
  </Animated.View>
  {active?<Pressable testID="help-message-selection-toggle" accessibilityRole="checkbox" accessibilityLabel={`Выбрать сообщение ${messageId}`} accessibilityState={{checked:selected}} onPress={toggle} style={StyleSheet.absoluteFill}/>:null}
 </View>;
}
const styles=StyleSheet.create({
 row:{width:'100%'},
 checkboxPosition:{position:'absolute',left:16,top:0,bottom:0,justifyContent:'center'},
 checkbox:{width:26,height:26,borderRadius:13,borderWidth:2,borderColor:'#FFFFFF',alignItems:'center',justifyContent:'center'},
});
