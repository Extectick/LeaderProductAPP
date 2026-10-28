import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {Platform} from 'react-native';
import {requireNativeViewManager, requireOptionalNativeModule} from 'expo-modules-core';
import {helpDevActions, helpDevProbe, helpDevRef} from '../helpDiagnostics';

export const hasNativeHelpInput = Platform.OS === 'android' && requireOptionalNativeModule('LeaderHelpInput')?.apiVersion === 1;
const NativeInput = hasNativeHelpInput ? requireNativeViewManager<any>('LeaderHelpInput') : null;
export type HelpNativeInputHandle = {focus: () => void};
type Props = {
  value: string; onChange: (value: string) => void; placeholder: string;
  color: string; hintColor: string; accentColor: string; editable: boolean; reducedMotion: boolean;
  onGeometry: (height: number, contentHeight: number) => void;
};

export const HelpNativeInput = forwardRef<HelpNativeInputHandle, Props>(function HelpNativeInput(props, forwardedRef) {
  const native = useRef<any>(null);
  const [eventCount, setEventCount] = useState(0);
  useImperativeHandle(forwardedRef, () => ({focus: () => { void native.current?.focusInput(); }}), []);
  useEffect(() => helpDevProbe('composer', () => native.current?.diagnostics()), []);
  useEffect(() => helpDevActions('composer.native', {
    'composer.resetMetrics': () => native.current?.resetDiagnostics(),
    'composer.type': value => { if (typeof value === 'string') return native.current?.testInput(value, 35); },
    'composer.paste': value => { if (typeof value === 'string') return native.current?.testInput(value, 0); },
    'composer.selection': value => { const range=String(value).split(':').map(Number); if(range.length===2&&range.every(Number.isFinite))return native.current?.testSelection(range[0],range[1]); },
    'composer.delete': value => { const count=Number(value); if(Number.isSafeInteger(count))return native.current?.testDelete(count); },
  }), []);
  if (!NativeInput) return null;
  return <NativeInput ref={(node:any) => { native.current=node; helpDevRef('composer.input',node?.nativeRef?.current ?? null); }}
    testID="help-native-input" style={{alignSelf:'stretch',minHeight:46}}
    textState={{text:props.value,eventCount}} placeholder={props.placeholder}
    textColor={props.color} hintColor={props.hintColor} accentColor={props.accentColor}
    editable={props.editable} reducedMotion={props.reducedMotion}
    onTextEdited={(event:any) => { setEventCount(event.nativeEvent.eventCount); props.onChange(event.nativeEvent.text); }}
    onGeometry={(event:any) => props.onGeometry(event.nativeEvent.height,event.nativeEvent.contentHeight)}/>
});
