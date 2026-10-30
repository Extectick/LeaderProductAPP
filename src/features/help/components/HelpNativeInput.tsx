import React, {forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState} from 'react';
import {Platform} from 'react-native';
import {requireNativeViewManager, requireOptionalNativeModule} from 'expo-modules-core';
import {helpDevActions, helpDevProbe, helpDevRef} from '../helpDiagnostics';
import {isDetachedHelpInputFocusError} from '../helpInputFocus';

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
  const mounted=useRef(false);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;native.current=null;};},[]);
  const attach=useCallback((node:any)=>{native.current=node;helpDevRef('composer.input',node?.nativeRef?.current??null);},[]);
  const focusFailure=useCallback((error:unknown)=>{
    if(isDetachedHelpInputFocusError(error))return;
    const detail=error as {code?:unknown;name?:unknown}|null;
    console.warn('[help] native input focus failed',{code:typeof detail?.code==='string'?detail.code.slice(0,80):'UNKNOWN',name:typeof detail?.name==='string'?detail.name.slice(0,80):'Error'});
  },[]);
  const [eventCount, setEventCount] = useState(0);
  useImperativeHandle(forwardedRef, () => ({focus: () => {
    const node=native.current;if(!mounted.current||!node||!props.editable)return;
    try{void Promise.resolve(node.focusInput()).catch(focusFailure);}catch(error){focusFailure(error);}
  }}), [props.editable,focusFailure]);
  useEffect(() => helpDevProbe('composer', () => native.current?.diagnostics()), []);
  useEffect(() => helpDevActions('composer.native', {
    'composer.resetMetrics': () => native.current?.resetDiagnostics(),
    'composer.type': value => { if (typeof value === 'string') return native.current?.testInput(value, 35); },
    'composer.paste': value => { if (typeof value === 'string') return native.current?.testInput(value, 0); },
    'composer.selection': value => { const range=String(value).split(':').map(Number); if(range.length===2&&range.every(Number.isFinite))return native.current?.testSelection(range[0],range[1]); },
    'composer.delete': value => { const count=Number(value); if(Number.isSafeInteger(count))return native.current?.testDelete(count); },
  }), []);
  if (!NativeInput) return null;
  return <NativeInput ref={attach}
    testID="help-native-input" style={{alignSelf:'stretch',minHeight:46}}
    textState={{text:props.value,eventCount}} placeholder={props.placeholder}
    textColor={props.color} hintColor={props.hintColor} accentColor={props.accentColor}
    editable={props.editable} reducedMotion={props.reducedMotion}
    onTextEdited={(event:any) => { setEventCount(event.nativeEvent.eventCount); props.onChange(event.nativeEvent.text); }}
    onGeometry={(event:any) => props.onGeometry(event.nativeEvent.height,event.nativeEvent.contentHeight)}/>
});
