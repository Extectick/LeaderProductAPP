import React,{createContext,useContext,useLayoutEffect,useMemo,useRef} from 'react';
import {Animated,Easing} from 'react-native';
import {useHelpReducedMotion} from '../helpTheme';

/** Shared by the outbox footer and confirmed rows for one chat scene. */
export const HelpMessageArrivalContext=createContext<Set<string>|null>(null);
export const helpArrivalIdentity=(message:{id:number;clientMessageId?:string|null})=>message.clientMessageId?`client:${message.clientMessageId}`:`message:${message.id}`;
const motions=new WeakMap<Set<string>,Map<string,{progress:Animated.Value;motion:Animated.CompositeAnimation}>>();

export function HelpMessageArrival({identity,animate,children}:{identity:string;animate:boolean;children:React.ReactNode}){
  const registry=useContext(HelpMessageArrivalContext),local=useRef(new Set<string>()),played=registry??local.current;
  const reduced=useHelpReducedMotion();
  const inherited=useMemo(()=>motions.get(played)?.get(identity),[identity,played]);
  const progress=useMemo(()=>inherited?.progress??new Animated.Value(1),[inherited,identity,played]);
  const latestAnimate=useRef(animate);latestAnimate.current=animate;
  useLayoutEffect(()=>{
    const play=latestAnimate.current&&!played.has(identity)&&!reduced;
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
      if(reduced&&motions.get(played)?.has(identity)){progress.stopAnimation();progress.setValue(1);motions.get(played)?.delete(identity);}
      else if(inherited){let active=true;progress.stopAnimation(value=>{if(active&&value<1)begin(Math.max(1,220*(1-value)));});return()=>{active=false;};}
      return;
    }
    progress.stopAnimation();progress.setValue(0);begin(220);
    // The bounded driver outlives a pending footer unmount so the server row
    // can take over. The weak registry releases the scene after navigation.
    // Content/acknowledgement updates must not restart an in-flight arrival.
  },[identity,played,progress,reduced,inherited]);
  return <Animated.View testID="help-message-arrival" style={{transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[24,0]})}]}}>{children}</Animated.View>;
}
