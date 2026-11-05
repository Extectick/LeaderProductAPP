import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { HelpAiIcon } from './HelpAiIcon';

/** Fits the usable chat viewport supplied by the screen, including its IME. */
export function HelpEmptyConversation({active=true,style,nativeID}:{active?:boolean;style?:StyleProp<ViewStyle>;nativeID?:string}) {
  const c=useHelpTheme(),reduced=useHelpReducedMotion();
  const opacity=useRef(new Animated.Value(reduced?1:0)).current;
  useEffect(()=>{
    opacity.stopAnimation();
    if(reduced){opacity.setValue(1);return;}
    if(!active){opacity.setValue(0);return;}
    const fade=Animated.timing(opacity,{toValue:1,duration:180,easing:Easing.out(Easing.cubic),useNativeDriver:true,isInteraction:false});
    fade.start();return()=>fade.stop();
  },[active,reduced,opacity]);
  return <Animated.View testID="help-new-ticket-hint" nativeID={nativeID} collapsable={false} pointerEvents="none" style={[styles.container,style,{opacity}]}>
    <View accessibilityRole="image" accessibilityLabel="ИИ-помощник" style={[styles.avatar,{backgroundColor:c.accent}]}><HelpAiIcon size={40}/></View>
    <Text style={[styles.title,{color:c.text}]}>Чем помочь?</Text>
    <Text style={[styles.subtitle,{color:c.muted}]}>Опишите проблему — начнём разбираться</Text>
  </Animated.View>;
}

const styles=StyleSheet.create({
  container:{flex:1,minHeight:0,alignItems:'center',justifyContent:'center',paddingHorizontal:28},
  avatar:{width:64,height:64,borderRadius:32,alignItems:'center',justifyContent:'center',marginBottom:20},
  title:{fontSize:20,lineHeight:26,fontWeight:'600',textAlign:'center',marginBottom:10,includeFontPadding:false},
  subtitle:{maxWidth:280,fontSize:14,lineHeight:20,textAlign:'center',includeFontPadding:false},
});
