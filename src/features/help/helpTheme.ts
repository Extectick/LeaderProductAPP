import { AccessibilityInfo } from 'react-native';
import { useSyncExternalStore } from 'react';

export {appSurfaceTokens as helpThemeTokens,useAppSurfaceTheme as useHelpTheme} from '@/components/ui/appSurfaceTokens';
import {useAppSurfaceTheme as useHelpTheme} from '@/components/ui/appSurfaceTokens';
export type HelpTheme = ReturnType<typeof useHelpTheme>;
// One native query/listener for the whole Help section, rather than one bridge
// round trip and subscription for every mounted message, icon and attachment.
let reducedMotion=false,motionGeneration=0,motionRevision=0;
const motionListeners=new Set<()=>void>();
let motionSubscription:ReturnType<typeof AccessibilityInfo.addEventListener>|null=null;
const motionSnapshot=()=>reducedMotion;
function publishMotion(value:boolean){
  ++motionRevision;
  if(reducedMotion===value)return;
  reducedMotion=value;motionListeners.forEach(listener=>listener());
}
function subscribeMotion(listener:()=>void){
  motionListeners.add(listener);
  if(!motionSubscription){
    const generation=++motionGeneration,revision=motionRevision;
    motionSubscription=AccessibilityInfo.addEventListener('reduceMotionChanged',publishMotion);
    void Promise.resolve(AccessibilityInfo.isReduceMotionEnabled()).then(value=>{
      if(generation===motionGeneration&&revision===motionRevision)publishMotion(Boolean(value));
    }).catch(()=>{});
  }
  return()=>{motionListeners.delete(listener);if(!motionListeners.size){++motionGeneration;motionSubscription?.remove();motionSubscription=null;}};
}
export function useHelpReducedMotion(){return useSyncExternalStore(subscribeMotion,motionSnapshot,()=>false);}
