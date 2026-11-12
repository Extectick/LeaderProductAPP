import React, {useEffect, useRef} from 'react';
import {Platform} from 'react-native';
import {requireNativeViewManager, requireOptionalNativeModule} from 'expo-modules-core';
import {helpDevActions, helpDevProbe} from '../helpDiagnostics';
import {useHelpReducedMotion} from '../helpTheme';
import {HELP_TAIL_MOTION} from '../helpTailMotion';

const layoutModule = Platform.OS === 'android' ? requireOptionalNativeModule('LeaderHelpChatLayout') : null;
export const hasNativeChatLayout = Boolean(layoutModule);
export const hasNativeAtomicTailMotion = (layoutModule?.tailMotionVersion ?? 0) >= 3;
export const hasNativeStableImeLayout = (layoutModule?.imeInsetsVersion ?? 0) >= 4;
export const hasNativeImeLayout = (layoutModule?.imeInsetsVersion ?? 0) >= 2;
export const hasNativeDockControls = (layoutModule?.dockControlsVersion ?? 0) >= 1;
export const hasNativeEmptyHintMotion = (layoutModule?.emptyHintMotionVersion ?? 0) >= 1;
const NativeLayout = hasNativeChatLayout ? requireNativeViewManager<any>('LeaderHelpChatLayout') : null;

export function HelpNativeChatLayout({scrollId, dockId, controlsId, emptyHintId, viewportId, allowFollow = true, animateTail = true, manageIme = true, onImeInsetChange}: {scrollId: string; dockId: string; controlsId?:string; emptyHintId?:string; viewportId?:string; allowFollow?: boolean; animateTail?: boolean; manageIme?:boolean; onImeInsetChange?:(inset:number)=>void}) {
  const ref = useRef<any>(null);
  const reducedMotion = useHelpReducedMotion();
  useEffect(() => helpDevProbe('chat', () => ref.current?.diagnostics()), []);
  useEffect(() => helpDevActions('chat.native', {'chat.resetMetrics': () => ref.current?.resetDiagnostics()}), []);
  // Keep message pixels beneath the header/dock glass. Native viewport clipping
  // at the composer's top removes the very capture the bottom BlurView needs.
  // Scroll padding, tail following and read occlusion still use the dock bounds.
  return NativeLayout ? <NativeLayout ref={ref} scrollId={scrollId} dockId={dockId} {...(hasNativeDockControls?{controlsId:controlsId??''}:{})} {...(hasNativeEmptyHintMotion?{emptyHintId:emptyHintId??''}:{})} allowFollow={allowFollow} {...(layoutModule?.tailMotionVersion ? {reducedMotion:reducedMotion||!animateTail} : {})} {...(hasNativeAtomicTailMotion?{tailMotionConfig:HELP_TAIL_MOTION}:{})} {...(layoutModule?.imeInsetsVersion ? {viewportId:'',onImeInsetChange:(event:any)=>onImeInsetChange?.(event.nativeEvent.inset)} : {})} {...((layoutModule?.imeInsetsVersion??0)>=3?{manageIme}:{})} pointerEvents="none" accessible={false} style={{position:'absolute',width:0,height:0}}/> : null;
}
