import { useTheme } from '@/context/ThemeContext';
import { AccessibilityInfo } from 'react-native';
import { useSyncExternalStore } from 'react';

/** Final prototype.css tokens; surface remains the incoming-message compatibility alias. */
export function helpThemeTokens(dark: boolean) {
  const incoming = dark ? '#222B35' : '#FFFFFF';
  const panel = dark ? '#1E2730' : '#EEF2F7';
  return { dark, background: dark ? '#151B22' : '#F7F9FC', headerSurface: dark ? '#151B22' : '#FFFFFF', incoming, surface: incoming, panel, elevated: panel, soft: dark ? '#203043' : '#EAF2FF', text: dark ? '#F2F4F7' : '#18212D', muted: dark ? '#A6B0BE' : '#627185', line: dark ? '#33404E' : '#DCE3EC', accent: dark ? '#398DFF' : '#3289FF', accentText: dark ? '#68B0FF' : '#2563EB', outgoing: dark ? '#233F60' : '#E3EFFF', green: dark ? '#4ED888' : '#21864E', closedBackground: dark ? '#20262D' : '#F0F1F3', closedText: dark ? '#A4ADB8' : '#68717C', draftText: dark ? '#FF7C89' : '#D44956', danger: dark ? '#FF9393' : '#BD3636' };
}
export function useHelpTheme() {
  const { theme } = useTheme();
  return helpThemeTokens(theme === 'dark');
}
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
