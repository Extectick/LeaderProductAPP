import React, {useEffect, useRef} from 'react';
import {Platform} from 'react-native';
import {requireNativeViewManager, requireOptionalNativeModule} from 'expo-modules-core';
import {helpDevActions, helpDevProbe} from '../helpDiagnostics';

export const hasNativeChatLayout = Platform.OS === 'android' && Boolean(requireOptionalNativeModule('LeaderHelpChatLayout'));
const NativeLayout = hasNativeChatLayout ? requireNativeViewManager<any>('LeaderHelpChatLayout') : null;

export function HelpNativeChatLayout({scrollId, dockId, allowFollow = true}: {scrollId: string; dockId: string; allowFollow?: boolean}) {
  const ref = useRef<any>(null);
  useEffect(() => helpDevProbe('chat', () => ref.current?.diagnostics()), []);
  useEffect(() => helpDevActions('chat.native', {'chat.resetMetrics': () => ref.current?.resetDiagnostics()}), []);
  return NativeLayout ? <NativeLayout ref={ref} scrollId={scrollId} dockId={dockId} allowFollow={allowFollow} pointerEvents="none" accessible={false} style={{position:'absolute',width:0,height:0}}/> : null;
}
