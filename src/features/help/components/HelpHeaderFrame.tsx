import React, {useEffect,useRef,useState} from 'react';
import {AppState,Platform,Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpTheme} from '../helpTheme';
import {HELP_LIST_INSET} from '../helpLayout';
import {helpDevRef} from '../helpDiagnostics';
import {HelpIcon} from './HelpPrimitives';
import {APP_TOOLBAR_LAYOUT as layout} from '@/components/ui/appToolbarLayout';
import {AppWorkspaceHeader} from '@/components/ui/AppWorkspaceHeader';
import type {HelpConnectionPhase} from '../helpConnectionState';

import {HELP_HEADER_EYEBROW_INSET as eyebrowInset} from '../helpHeaderGeometry';
export {helpHeaderFrameHeight} from '../helpHeaderGeometry';
const foreground=()=>Platform.OS==='web'
  ? typeof document==='undefined'||document.visibilityState!=='hidden'
  : AppState.currentState==='active';

/** Only sustained failures are visible. Routine foreground checks and history
 * synchronization are silent; timers never include time spent asleep. */
function useConnectionPresentation(phase:HelpConnectionPhase,attempt:number) {
  const phaseRef=useRef({value:phase,revision:0});
  if(phaseRef.current.value!==phase)phaseRef.current={value:phase,revision:phaseRef.current.revision+1};
  const [visibility,setVisibility]=useState(()=>({active:foreground(),epoch:0}));
  const visibilityRef=useRef(visibility);visibilityRef.current=visibility;
  useEffect(()=>{
    const changed=()=>{
      const active=foreground();
      if(visibilityRef.current.active===active)return;
      const next={active,epoch:visibilityRef.current.epoch+1};
      visibilityRef.current=next;setVisibility(next);
    };
    const subscription=AppState.addEventListener('change',changed);
    if(Platform.OS==='web'&&typeof document!=='undefined')document.addEventListener('visibilitychange',changed);
    changed();
    return()=>{subscription.remove();if(Platform.OS==='web'&&typeof document!=='undefined')document.removeEventListener('visibilitychange',changed);};
  },[]);
  const key=`${phaseRef.current.revision}:${visibility.epoch}:${attempt}`;
  const [presentation,setPresentation]=useState({key:'',shown:false});
  const failed=phase==='offline'||phase==='sync-error';
  const active=visibility.active&&(failed||phase==='connecting');
  useEffect(()=>{
    if(!active)return;
    let alive=true;
    const valid=()=>alive&&foreground()&&visibilityRef.current.epoch===visibility.epoch;
    const timer=setTimeout(()=>{if(valid())setPresentation({key,shown:true});},failed?3000:12000);
    return()=>{alive=false;clearTimeout(timer);};
  },[key,active,failed,visibility.epoch]);
  return {shown:active&&presentation.key===key&&presentation.shown};
}

export function HelpHeaderFrame({children,onBack,trailing,connecting=false,connectionPhase,onReconnect,eyebrow,reserveEyebrow=false,title,contentSurface='pill',backLabel='Назад',backIcon='chevron-back'}:{children?:React.ReactNode;onBack?:()=>void;trailing?:React.ReactNode;connecting?:boolean;connectionPhase?:HelpConnectionPhase;onReconnect?:()=>void;eyebrow?:string;reserveEyebrow?:boolean;title?:string;contentSurface?:'pill'|'plain';backLabel?:string;backIcon?:React.ComponentProps<typeof Ionicons>['name']}) {
  const c=useHelpTheme();
  const [attempt,setAttempt]=useState(0);
  const phase=connectionPhase??(connecting?'connecting':'ready');
  const {shown}=useConnectionPresentation(phase,attempt);
  const syncFailed=phase==='sync-error';
  const text=syncFailed?'Не удалось обновить':'Нет связи';
  const retry=()=>{setAttempt(value=>value+1);onReconnect?.();};
  return <AppWorkspaceHeader colors={c} surfaceRef={node=>helpDevRef('header.surface',node)} ids={{root:'help-header',content:'help-search-surface',eyebrow:'help-header-ticket-number'}}
    eyebrow={eyebrow} reserveEyebrow={reserveEyebrow} eyebrowInset={eyebrowInset} title={title} contentSurface={contentSurface}
    leading={onBack?<HelpIcon name={backIcon} label={backLabel} onPress={onBack} color={c.text} size={24} style={{width:layout.actionSize,height:layout.actionSize,backgroundColor:c.panel,borderRadius:layout.actionSize/2}}/>:null}
    trailing={trailing}
    footer={shown?<View style={{position:'absolute',bottom:0,right:HELP_LIST_INSET,flexDirection:'row',alignItems:'center',gap:4,height:14}}>
      <Ionicons name={syncFailed?'alert-circle-outline':'cloud-offline-outline'} size={10} color={c.muted}/>
      <Text testID="help-connection-status" accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:10,lineHeight:12}}>{text}</Text>
      {onReconnect?<Pressable testID="help-connection-retry" accessibilityRole="button" accessibilityLabel={syncFailed?'Повторить обновление сообщений':'Повторить подключение'} onPress={retry} hitSlop={8}><Text style={{color:c.accentText,fontSize:10,lineHeight:12,fontWeight:'600'}}>Повторить</Text></Pressable>:null}
    </View>:null}>
    {children}
  </AppWorkspaceHeader>;
}
