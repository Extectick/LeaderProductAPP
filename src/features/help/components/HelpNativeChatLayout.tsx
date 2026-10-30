import React, {useEffect, useRef} from 'react';
import {Platform} from 'react-native';
import {requireNativeViewManager, requireOptionalNativeModule} from 'expo-modules-core';
import {helpDevActions, helpDevProbe} from '../helpDiagnostics';
import {useHelpReducedMotion} from '../helpTheme';

const layoutModule = Platform.OS === 'android' ? requireOptionalNativeModule('LeaderHelpChatLayout') : null;
export const hasNativeChatLayout = Boolean(layoutModule);
const NativeLayout = hasNativeChatLayout ? requireNativeViewManager<any>('LeaderHelpChatLayout') : null;

export function HelpNativeChatLayout({scrollId, dockId, allowFollow = true}: {scrollId: string; dockId: string; allowFollow?: boolean}) {
  const ref = useRef<any>(null);
  const reducedMotion = useHelpReducedMotion();
  useEffect(() => helpDevProbe('chat', () => ref.current?.diagnostics()), []);
  useEffect(() => helpDevActions('chat.native', {'chat.resetMetrics': () => ref.current?.resetDiagnostics()}), []);
  return NativeLayout ? <NativeLayout ref={ref} scrollId={scrollId} dockId={dockId} allowFollow={allowFollow} {...(layoutModule?.tailMotionVersion ? {reducedMotion} : {})} pointerEvents="none" accessible={false} style={{position:'absolute',width:0,height:0}}/> : null;
}
