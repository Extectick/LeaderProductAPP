import React, {useEffect, useRef} from 'react';
import {Platform} from 'react-native';
import {requireNativeViewManager, requireOptionalNativeModule} from 'expo-modules-core';
import {helpDevActions, helpDevProbe} from '../helpDiagnostics';
import {useHelpReducedMotion} from '../helpTheme';

const layoutModule = Platform.OS === 'android' ? requireOptionalNativeModule('LeaderHelpChatLayout') : null;
export const hasNativeChatLayout = Boolean(layoutModule);
export const hasNativeStableImeLayout = (layoutModule?.imeInsetsVersion ?? 0) >= 4;
export const hasNativeImeLayout = (layoutModule?.imeInsetsVersion ?? 0) >= 2;
export const hasNativeDockControls = (layoutModule?.dockControlsVersion ?? 0) >= 1;
const NativeLayout = hasNativeChatLayout ? requireNativeViewManager<any>('LeaderHelpChatLayout') : null;

export function HelpNativeChatLayout({scrollId, dockId, controlsId, viewportId, allowFollow = true, animateTail = true, manageIme = true, onImeInsetChange}: {scrollId: string; dockId: string; controlsId?:string; viewportId?:string; allowFollow?: boolean; animateTail?: boolean; manageIme?:boolean; onImeInsetChange?:(inset:number)=>void}) {
  const ref = useRef<any>(null);
  const reducedMotion = useHelpReducedMotion();
  useEffect(() => helpDevProbe('chat', () => ref.current?.diagnostics()), []);
  useEffect(() => helpDevActions('chat.native', {'chat.resetMetrics': () => ref.current?.resetDiagnostics()}), []);
  return NativeLayout ? <NativeLayout ref={ref} scrollId={scrollId} dockId={dockId} {...(hasNativeDockControls?{controlsId:controlsId??''}:{})} allowFollow={allowFollow} {...(layoutModule?.tailMotionVersion ? {reducedMotion:reducedMotion||!animateTail} : {})} {...(layoutModule?.imeInsetsVersion ? {viewportId,onImeInsetChange:(event:any)=>onImeInsetChange?.(event.nativeEvent.inset)} : {})} {...((layoutModule?.imeInsetsVersion??0)>=3?{manageIme}:{})} pointerEvents="none" accessible={false} style={{position:'absolute',width:0,height:0}}/> : null;
}
