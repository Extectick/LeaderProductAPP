import React, {useEffect, useLayoutEffect, useRef} from 'react';
import type {LayoutChangeEvent} from 'react-native';
import Reanimated, {cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {useHelpReducedMotion} from '../helpTheme';

const DURATION=220;

/** One question-area height inside the painted composer; input stays its sibling. */
export function HelpQuestionReveal({collapsed,children,collapsedContent}:{collapsed:boolean;children:React.ReactNode;collapsedContent:React.ReactNode}) {
  const reduced=useHelpReducedMotion();
  const height=useSharedValue(0),expandedHeight=useSharedValue(0),collapsedHeight=useSharedValue(44);
  const hasCollapsed=useSharedValue(collapsed);
  const sizes=useRef({expanded:0,collapsed:44});
  const latest=useRef({collapsed,reduced});latest.current={collapsed,reduced};
  const resize=(target:number)=>{
    if(target<=0)return;
    cancelAnimation(height);
    height.value=latest.current.reduced?target:withTiming(target,{duration:DURATION,easing:Easing.out(Easing.cubic)});
  };
  useLayoutEffect(()=>{
    if(collapsed)hasCollapsed.value=true;
    resize(collapsed?sizes.current.collapsed:sizes.current.expanded);
  },[collapsed,reduced]);
  useEffect(()=>()=>cancelAnimation(height),[height]);
  const measure=(layer:'expanded'|'collapsed',event:LayoutChangeEvent)=>{
    const next=event.nativeEvent.layout.height;
    if(!Number.isFinite(next)||next<=0||Math.abs(next-sizes.current[layer])<.5)return;
    sizes.current[layer]=next;
    if(layer==='expanded')expandedHeight.value=next;else collapsedHeight.value=next;
    if((layer==='collapsed')===latest.current.collapsed)resize(next);
  };
  // Visibility follows the same real height; there is no second animation clock
  // or completion callback that could finish an older interrupted transition.
  const progress=()=>{
    'worklet';
    const distance=expandedHeight.value-collapsedHeight.value;
    return Math.abs(distance)<.5?(collapsed?0:1):Math.max(0,Math.min(1,(height.value-collapsedHeight.value)/distance));
  };
  const viewport=useAnimatedStyle(()=>({height:height.value}));
  // Keep the two different headings from painting on top of each other.
  const expandedStyle=useAnimatedStyle(()=>({opacity:Math.max(0,Math.min(1,(progress()-.15)/.85))}));
  const collapsedStyle=useAnimatedStyle(()=>({opacity:hasCollapsed.value?Math.max(0,Math.min(1,(.15-progress())/.15)):0}));
  return <Reanimated.View testID="help-question-reveal" style={[{overflow:'hidden'},viewport]}>
    <Reanimated.View testID="help-question-reveal-expanded" pointerEvents={collapsed?'none':'auto'} accessibilityElementsHidden={collapsed} importantForAccessibility={collapsed?'no-hide-descendants':'auto'} onLayout={event=>measure('expanded',event)} style={[{position:'absolute',top:0,left:0,right:0},expandedStyle]}>{children}</Reanimated.View>
    <Reanimated.View testID="help-question-reveal-collapsed" pointerEvents={collapsed?'auto':'none'} accessibilityElementsHidden={!collapsed} importantForAccessibility={collapsed?'auto':'no-hide-descendants'} onLayout={event=>measure('collapsed',event)} style={[{position:'absolute',top:0,left:0,right:0},collapsedStyle]}>{collapsedContent}</Reanimated.View>
  </Reanimated.View>;
}
