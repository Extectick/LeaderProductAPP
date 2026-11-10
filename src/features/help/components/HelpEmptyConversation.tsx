import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { HelpAiIcon } from './HelpAiIcon';

/** Fits the usable chat viewport supplied by the screen, including its IME. */
export function HelpEmptyConversation({active=true,style,nativeID,keyboardInset=0}:{active?:boolean;style?:StyleProp<ViewStyle>;nativeID?:string;keyboardInset?:number}) {
  const c=useHelpTheme(),reduced=useHelpReducedMotion();
  const opacity=useRef(new Animated.Value(reduced?1:0)).current;
  const target=!nativeID&&keyboardInset>0?-keyboardInset/2:0;
  const displacement=useRef(new Animated.Value(target)).current;
  useLayoutEffect(()=>{
    // New clients center this view in the native dock's actual IME frame.
    // Older clients receive settled insets; smooth only the hint's transform,
    // keeping its Yoga bounds and the composer/IME owner unchanged.
    if(nativeID||reduced){displacement.stopAnimation();displacement.setValue(target);return;}
    // Retarget the same animated value from its current presentation. Do not
    // stop/reset it on every intermediate inset change.
    Animated.spring(displacement,{toValue:target,stiffness:180,damping:28,mass:1,overshootClamping:true,restDisplacementThreshold:.1,restSpeedThreshold:.1,useNativeDriver:true,isInteraction:false}).start();
  },[nativeID,target,reduced,displacement]);
  useEffect(()=>()=>displacement.stopAnimation(),[displacement]);
  useEffect(()=>{
    opacity.stopAnimation();
    if(reduced){opacity.setValue(1);return;}
    if(!active){opacity.setValue(0);return;}
    const fade=Animated.timing(opacity,{toValue:1,duration:180,easing:Easing.out(Easing.cubic),useNativeDriver:true,isInteraction:false});
    fade.start();return()=>fade.stop();
  },[active,reduced,opacity]);
  return <Animated.View testID="help-new-ticket-hint" nativeID={nativeID} collapsable={false} pointerEvents="none" style={[styles.container,style,{opacity}]}>
    <Animated.View testID="help-new-ticket-hint-content" style={[styles.content,{transform:[{translateY:displacement}]}]}>
    <View accessibilityRole="image" accessibilityLabel="ИИ-помощник" style={[styles.avatar,{backgroundColor:c.accent}]}><HelpAiIcon size={40}/></View>
    <Text style={[styles.title,{color:c.text}]}>Чем помочь?</Text>
    <Text style={[styles.subtitle,{color:c.muted}]}>Опишите проблему — начнём разбираться</Text>
    </Animated.View>
  </Animated.View>;
}

const styles=StyleSheet.create({
  container:{flex:1,minHeight:0,alignItems:'center',justifyContent:'center',paddingHorizontal:28},
  content:{flex:1,alignSelf:'stretch',alignItems:'center',justifyContent:'center'},
  avatar:{width:64,height:64,borderRadius:32,alignItems:'center',justifyContent:'center',marginBottom:20},
  title:{fontSize:20,lineHeight:26,fontWeight:'600',textAlign:'center',marginBottom:10,includeFontPadding:false},
  subtitle:{maxWidth:280,fontSize:14,lineHeight:20,textAlign:'center',includeFontPadding:false},
});
