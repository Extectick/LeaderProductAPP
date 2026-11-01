import React, {forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState} from 'react';
import {useWindowDimensions, type LayoutChangeEvent} from 'react-native';
import Reanimated, {cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue} from 'react-native-reanimated';
import {useHelpReducedMotion} from '../helpTheme';

export type HelpChatEntryHandle = {reveal:()=>void; dismiss:()=>Promise<boolean>};
type Props = {ready:boolean; children:React.ReactNode; onLayout:(event:LayoutChangeEvent)=>void; onEntered:()=>void; backgroundColor:string; progress?:SharedValue<number>};

/** One UI-thread progress owns both directions. Keep the list below this opaque
 * scene; bitmap snapshots and list remounts must not interrupt navigation. */
export const HelpChatEntry=forwardRef<HelpChatEntryHandle,Props>(function HelpChatEntry({ready:initiallyReady,children,onLayout,onEntered,backgroundColor,progress:sharedProgress},ref){
  const localProgress=useSharedValue(0),progress=sharedProgress??localProgress;
  const reduced=useHelpReducedMotion(),width=Math.min(useWindowDimensions().width,900);
  const [revealed,setRevealed]=useState(false),[exiting,setExiting]=useState(false);
  const ready=initiallyReady||revealed;
  const live=useRef({reduced,onEntered});live.current={reduced,onEntered};
  const mounted=useRef(true),leaving=useRef(false),didEnter=useRef(false);
  const completion=useRef<((finished:boolean)=>void)|null>(null),exitPromise=useRef<Promise<boolean>|null>(null);
  const entered=useCallback(()=>{if(mounted.current&&!leaving.current&&!didEnter.current){didEnter.current=true;live.current.onEntered();}},[]);
  const dismissed=useCallback(()=>{completion.current?.(true);completion.current=null;},[]);
  useLayoutEffect(()=>{
    mounted.current=true;progress.value=0;
    return()=>{mounted.current=false;cancelAnimation(progress);completion.current?.(false);completion.current=null;};
  },[progress]);
  useEffect(()=>{
    if(!ready||leaving.current||didEnter.current)return;
    if(reduced){progress.value=1;entered();return;}
    progress.value=withTiming(1,{duration:240,easing:Easing.out(Easing.cubic)},finished=>{if(finished)runOnJS(entered)();});
  },[ready,reduced,progress,entered]);
  useImperativeHandle(ref,()=>({
    reveal:()=>setRevealed(true),
    dismiss:()=>{
      if(exitPromise.current)return exitPromise.current;
      leaving.current=true;setExiting(true);cancelAnimation(progress);
      const request=new Promise<boolean>(resolve=>{completion.current=resolve;});exitPromise.current=request;
      if(live.current.reduced||!ready){progress.value=0;dismissed();}
      else progress.value=withTiming(0,{duration:220,easing:Easing.out(Easing.cubic)},finished=>{if(finished)runOnJS(dismissed)();});
      return request;
    },
  }),[progress,ready,dismissed]);
  // FlashList must measure its first window inside the viewport. Parking an
  // unmeasured long list offscreen can clip its cells and deadlock readiness.
  const style=useAnimatedStyle(()=>({opacity:ready?1:0,transform:[{translateX:ready?width*(1-progress.value):0}]}),[width,ready]);
  return <Reanimated.View testID="help-chat-viewport" onLayout={onLayout} pointerEvents={ready&&!exiting?'auto':'none'} style={[{flex:1,backgroundColor},style]}>{children}</Reanimated.View>;
});
