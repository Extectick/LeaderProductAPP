import React,{createContext,useContext,useLayoutEffect,useMemo,useRef} from 'react';
import {Animated,Easing} from 'react-native';
import {useHelpReducedMotion} from '../helpTheme';

/** Shared by the outbox footer and confirmed rows for one chat scene. */
export const HelpMessageArrivalContext=createContext<Set<string>|null>(null);
/** Descendant AI steps/answers share the timeline lift instead of starting a second translation. */
export const HelpArrivalGeometryContext=createContext(false);
export const helpArrivalIdentity=(message:{id:number;clientMessageId?:string|null})=>message.clientMessageId?`client:${message.clientMessageId}`:`message:${message.id}`;
const motions=new WeakMap<Set<string>,Map<string,{progress:Animated.Value;motion:Animated.CompositeAnimation}>>();

export function HelpMessageArrival({identity,animate,children,distance=24,deferred=false}:{identity:string;animate:boolean;children:React.ReactNode;distance?:number;deferred?:boolean}){
  const registry=useContext(HelpMessageArrivalContext),local=useRef(new Set<string>()),played=registry??local.current;
  const reduced=useHelpReducedMotion(),geometryOwned=useContext(HelpArrivalGeometryContext);
  const inherited=useMemo(()=>motions.get(played)?.get(identity),[identity,played]);
  const progress=useMemo(()=>inherited?.progress??new Animated.Value(1),[inherited,identity,played]);
  // The timeline can own the entire row's lift. Keep that decision for this
  // cell's lifetime so a quick receipt/geometry commit cannot change its path.
  const arrivalDistance=useRef(geometryOwned?0:distance).current;
  const latestAnimate=useRef(animate);latestAnimate.current=animate;
  const wasDeferred=useRef(false);
  useLayoutEffect(()=>{
    if(deferred){wasDeferred.current=true;progress.setValue(reduced?1:0);return;}
    const released=wasDeferred.current;wasDeferred.current=false;
    const play=latestAnimate.current&&!played.has(identity)&&!reduced&&arrivalDistance>0;
    played.add(identity);
    if(played.size>1000)played.delete(played.values().next().value!);
    const begin=(duration:number)=>{
      const motion=Animated.timing(progress,{toValue:1,duration,easing:Easing.out(Easing.cubic),useNativeDriver:true,isInteraction:false});
      let entries=motions.get(played);if(!entries){entries=new Map();motions.set(played,entries);}
      const entry={progress,motion};entries.set(identity,entry);
      motion.start(()=>{if(entries!.get(identity)===entry)entries!.delete(identity);});
    };
    // Static history dispatches no value updates. A fast acknowledgement keeps
    // the pending position even when detaching the footer stops its native driver.
    if(!play){
      if(released)progress.setValue(1);
      if(reduced&&motions.get(played)?.has(identity)){progress.stopAnimation();progress.setValue(1);motions.get(played)?.delete(identity);}
      else if(inherited){let active=true;progress.stopAnimation(value=>{if(active&&value<1)begin(Math.max(1,220*(1-value)));});return()=>{active=false;};}
      return;
    }
    progress.stopAnimation();progress.setValue(0);begin(220);
    // The bounded driver outlives a pending footer unmount so the server row
    // can take over. The weak registry releases the scene after navigation.
    // Content/acknowledgement updates must not restart an in-flight arrival.
  },[identity,played,progress,reduced,inherited,deferred,arrivalDistance]);
  return <Animated.View testID="help-message-arrival" style={{transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[arrivalDistance,0]})}]}}>{children}</Animated.View>;
}
