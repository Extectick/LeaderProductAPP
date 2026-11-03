import React,{forwardRef,useCallback,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import {useWindowDimensions,type LayoutChangeEvent} from 'react-native';
import Reanimated,{cancelAnimation,Easing,runOnJS,useAnimatedStyle,useSharedValue,withTiming,type SharedValue} from 'react-native-reanimated';

/** One source for Help chat entry and service-section navigation. */
export const APP_SCENE_MOTION={enterDuration:240,exitDuration:220,underlayFraction:.25,underlayMaximum:120} as const;
export type AppSceneTransitionHandle={reveal:()=>void;dismiss:()=>Promise<boolean>};
export type AppSceneTransitionProps={ready:boolean;reducedMotion:boolean;interactive?:boolean;children:React.ReactNode;onLayout?:(event:LayoutChangeEvent)=>void;onEntered?:()=>void;backgroundColor:string;progress?:SharedValue<number>;sceneTestID?:string};

/** UI-thread progress owns both directions; unmount only after dismiss resolves. */
export const AppSceneTransition=forwardRef<AppSceneTransitionHandle,AppSceneTransitionProps>(function AppSceneTransition({ready:initiallyReady,reducedMotion:reduced,interactive=true,children,onLayout,onEntered,backgroundColor,progress:sharedProgress,sceneTestID='app-scene-viewport'},ref){
  const localProgress=useSharedValue(0),progress=sharedProgress??localProgress;
  // Window width is not the scene width in a sidebar, split view or QA surface.
  // Measure while hidden; otherwise the first frame can expose half a page or
  // change travel distance after the animation has already started.
  const [width,setWidth]=useState(0);
  const [revealed,setRevealed]=useState(false),[exiting,setExiting]=useState(false),[settled,setSettled]=useState(false);
  const ready=(initiallyReady||revealed)&&width>0;
  const live=useRef({reduced,onEntered});live.current={reduced,onEntered};
  const mounted=useRef(true),leaving=useRef(false),didEnter=useRef(false);
  const completion=useRef<((finished:boolean)=>void)|null>(null),exitPromise=useRef<Promise<boolean>|null>(null);
  const entered=useCallback(()=>{if(mounted.current&&!leaving.current&&!didEnter.current){didEnter.current=true;setSettled(true);live.current.onEntered?.();}},[]);
  const dismissed=useCallback(()=>{completion.current?.(true);completion.current=null;},[]);
  useLayoutEffect(()=>{
    mounted.current=true;progress.value=0;
    return()=>{mounted.current=false;cancelAnimation(progress);completion.current?.(false);completion.current=null;};
  },[progress]);
  useEffect(()=>{
    if(!ready||leaving.current||didEnter.current)return;
    if(reduced){progress.value=1;entered();return;}
    progress.value=withTiming(1,{duration:APP_SCENE_MOTION.enterDuration,easing:Easing.out(Easing.cubic)},finished=>{if(finished)runOnJS(entered)();});
  },[ready,reduced,progress,entered]);
  useImperativeHandle(ref,()=>({
    reveal:()=>setRevealed(true),
    dismiss:()=>{
      if(exitPromise.current)return exitPromise.current;
      leaving.current=true;setExiting(true);cancelAnimation(progress);
      const request=new Promise<boolean>(resolve=>{completion.current=resolve;});exitPromise.current=request;
      if(live.current.reduced||!ready){progress.value=0;dismissed();}
      else progress.value=withTiming(0,{duration:APP_SCENE_MOTION.exitDuration,easing:Easing.out(Easing.cubic)},finished=>{if(finished)runOnJS(dismissed)();});
      return request;
    },
  }),[progress,ready,dismissed]);
  // Hidden lists measure inside the viewport before their first reveal.
  const style=useAnimatedStyle(()=>({opacity:ready?1:0,transform:[{translateX:ready?width*(1-progress.value):0}]}),[width,ready]);
  // Fabric may reapply an animated style's initial transform when IME/portal
  // updates commit. Persist the completed scene position in React as well.
  // Remove that override before an intentional exit so the UI thread owns it.
  return <Reanimated.View testID={sceneTestID} onLayout={event=>{const measured=event.nativeEvent.layout.width;if(measured>0)setWidth(previous=>Math.abs(previous-measured)>.5?measured:previous);onLayout?.(event);}} pointerEvents={ready&&!exiting&&interactive?'auto':'none'} style={[{flex:1,backgroundColor},style,settled&&!exiting?{opacity:1,transform:[{translateX:0}]}:undefined]}>{children}</Reanimated.View>;
});

/** Retain the previous page and move it with the exact same foreground progress. */
export function useAppSceneUnderlayMotion(progress:SharedValue<number>,active:boolean,sceneWidth?:number){
  const window=useWindowDimensions(),width=sceneWidth&&sceneWidth>0?sceneWidth:window.width;
  return useAnimatedStyle(()=>({transform:[{translateX:active?-Math.min(width*APP_SCENE_MOTION.underlayFraction,APP_SCENE_MOTION.underlayMaximum)*progress.value:0}]}),[width,active]);
}
