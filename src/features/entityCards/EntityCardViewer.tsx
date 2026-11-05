import React,{useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {HelpViewerLayout,type HelpViewerAction} from '../help/components/HelpViewerLayout';
import {useHelpTheme} from '../help/helpTheme';
import {copyEntityCardLink} from './entityCardActions';
import type {EntityCardHostProps} from './EntityCardHost.types';

/** Entity navigation keeps its own data/history engine; all viewer chrome is shared with HTML. */
export function EntityCardViewer({state,userId,onBack,onClose,children,bottomInset=0,onMenuOpenChange}:Pick<EntityCardHostProps,'state'|'userId'|'onBack'|'onClose'>&{children:React.ReactNode;bottomInset?:number;onMenuOpenChange?:(open:boolean)=>void}){
 const c=useHelpTheme(),frame=state.frames.at(-1)!;
 const [menu,setMenu]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const operation=useRef<AbortController|null>(null),scope=useRef({account:state.account,key:frame.key,userId,closing:state.closing});
 scope.current={account:state.account,key:frame.key,userId,closing:state.closing};
 useEffect(()=>{setMenu(false);setBusy(false);setNotice('');onMenuOpenChange?.(false);return()=>{operation.current?.abort();operation.current=null;};},[state.account,frame.key,userId,state.closing,onMenuOpenChange]);
 const changeMenu=(open:boolean)=>{setMenu(open);onMenuOpenChange?.(open);};
 async function copy(){
  if(frame.kind!=='entity'||operation.current||state.closing)return;
  const captured=scope.current,controller=new AbortController();operation.current=controller;setBusy(true);changeMenu(false);setNotice('');
  const isCurrent=()=>!controller.signal.aborted&&operation.current===controller&&!scope.current.closing&&scope.current.account===captured.account&&scope.current.key===captured.key&&scope.current.userId===captured.userId;
  try{await copyEntityCardLink(frame.target,{expectedUserId:userId,signal:controller.signal,isCurrent});if(isCurrent())setNotice('Ссылка скопирована');}
  catch(error){if(isCurrent()&&(error as Error).name!=='AbortError')setNotice('Не удалось скопировать ссылку. Попробуйте ещё раз.');}
  finally{if(isCurrent()){operation.current=null;setBusy(false);}}
 }
 const actions:HelpViewerAction[]=[
  ...(frame.kind==='entity'?[{id:'link',label:'Ссылка',icon:'link-outline' as const,onPress:()=>void copy(),disabled:busy||state.closing,busy}]:[]),
  {id:'close',label:'Закрыть просмотр',icon:'close-outline',onPress:()=>{operation.current?.abort();onClose();}},
 ];
 return <View testID="entity-card-viewer" style={{flex:1}}>
  <HelpViewerLayout testIDPrefix="entity-card" onBack={onBack} backLabel={state.frames.length>1?'Назад к предыдущей карточке':'Закрыть просмотр'} actions={actions} menuOpen={menu} onMenuOpenChange={changeMenu} bottomInset={bottomInset}>{children}</HelpViewerLayout>
  {notice?<View pointerEvents="none" style={{position:'absolute',left:16,right:16,bottom:bottomInset+16,alignItems:'center'}}><Text accessibilityLiveRegion="polite" style={{backgroundColor:c.panel,color:c.text,borderRadius:12,paddingHorizontal:14,paddingVertical:10,fontSize:13}}>{notice}</Text></View>:null}
 </View>;
}
