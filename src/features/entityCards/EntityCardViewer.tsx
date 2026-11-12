import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Linking,Platform,Share,Text,View} from 'react-native';
import {HelpViewerLayout,type HelpViewerAction} from '../help/components/HelpViewerLayout';
import {useHelpTheme} from '../help/helpTheme';
import {copyEntityCardLink} from './entityCardActions';
import {copyHelpHtmlLink,downloadHelpHtml} from '../help/helpHtmlActions';
import {parseEntityLink} from '../../shared/entityLinks';
import {normalizeWebUrl} from '../webPages/webPagePolicy';
import type {EntityCardHostProps} from './EntityCardHost.types';

type Props=Pick<EntityCardHostProps,'state'|'userId'|'onBack'|'onClose'|'onReloadPage'|'onRegisterMenuDismiss'>&{onOpen?:EntityCardHostProps['onOpen'];children:React.ReactNode;topInset?:number;bottomInset?:number;onMenuOpenChange?:(open:boolean)=>void};
/** One header/menu owns every content type; renderers retain their own scroll. */
export function EntityCardViewer({state,userId,onBack,onClose,onOpen,onReloadPage,onRegisterMenuDismiss,children,topInset=0,bottomInset=0,onMenuOpenChange}:Props){
 const c=useHelpTheme(),frame=state.frames.at(-1)!;
 const [menu,setMenu]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const menuRef=useRef(menu);menuRef.current=menu;
 const operation=useRef<AbortController|null>(null),scope=useRef({account:state.account,key:frame.key,userId,closing:state.closing,url:frame.kind==='web'?frame.currentUrl:''});
 scope.current={account:state.account,key:frame.key,userId,closing:state.closing,url:frame.kind==='web'?frame.currentUrl:''};
 const changeMenu=useCallback((open:boolean)=>{menuRef.current=open;setMenu(open);onMenuOpenChange?.(open);},[onMenuOpenChange]);
 useEffect(()=>{changeMenu(false);setBusy(false);setNotice('');return()=>{operation.current?.abort();operation.current=null;};},[state.account,frame.key,userId,state.closing,changeMenu]);
 useEffect(()=>{onRegisterMenuDismiss?.(frame.key,()=>{if(!menuRef.current)return false;changeMenu(false);return true;});return()=>onRegisterMenuDismiss?.(frame.key,null);},[frame.key,onRegisterMenuDismiss,changeMenu]);
 async function action(kind:'link'|'download'|'external'|'share'){
  if(operation.current||state.closing)return;
  if(frame.kind==='html'&&(frame.payload.expectedUserId!==userId||frame.payload.isCurrent?.()===false))return;
  const captured=scope.current,controller=new AbortController();operation.current=controller;setBusy(true);changeMenu(false);setNotice('');
  const isCurrent=()=>!controller.signal.aborted&&operation.current===controller&&!scope.current.closing&&scope.current.account===captured.account&&scope.current.key===captured.key&&scope.current.userId===captured.userId&&scope.current.url===captured.url&&(frame.kind!=='html'||frame.payload.isCurrent?.()!==false);
  const options={expectedUserId:userId,signal:controller.signal,isCurrent};
  try{
   if(frame.kind==='entity'&&kind==='link')await copyEntityCardLink(frame.target,options);
   else if(frame.kind==='html'){
    if(kind==='download')await downloadHelpHtml(frame.payload.artifact,c.text,options,frame.payload.imageDataUrl);
    else if(kind==='link'&&frame.payload.link)await copyHelpHtmlLink(frame.payload.artifact,frame.payload.link,options);
    else return;
   }else if(frame.kind==='web'){
    const url=normalizeWebUrl(frame.currentUrl);if(!url||!isCurrent())return;
    if(kind==='link'){
     const clipboard=require('expo-clipboard') as typeof import('expo-clipboard');
     if(!isCurrent())return;if(await clipboard.setStringAsync(url)===false)throw Error('COPY_FAILED');
    }else if(kind==='external')await Linking.openURL(url);
    else if(kind==='share'){
     if(Platform.OS==='web'){
      if(typeof navigator!=='undefined'&&typeof navigator.share==='function')await navigator.share({title:frame.title,url});
      else{const clipboard=require('expo-clipboard') as typeof import('expo-clipboard');if(await clipboard.setStringAsync(url)===false)throw Error('COPY_FAILED');if(isCurrent())setNotice('Ссылка скопирована');}
     }else await Share.share({title:frame.title,message:url,url});
    }
   }
   if(isCurrent()&&kind==='link')setNotice('Ссылка скопирована');
  }catch(error){if(isCurrent()&&(error as Error).name!=='AbortError')setNotice('Не удалось выполнить действие. Повторите попытку.');}
  finally{if(operation.current===controller){operation.current=null;if(isCurrent()||scope.current.key===captured.key){setBusy(false);}}}
 }
 const disabled=busy||state.closing;
 const actions:HelpViewerAction[]=[];
 if(frame.kind==='web'){
  actions.push({id:'reload',label:'Обновить',icon:'reload-outline',disabled:state.closing,onPress:()=>{changeMenu(false);onReloadPage?.(frame.key);}},
   {id:'link',label:Platform.OS==='web'?'Исходная ссылка':'Ссылка',icon:'link-outline',disabled,busy,onPress:()=>void action('link')},
   {id:'share',label:Platform.OS==='web'?'Поделиться исходной ссылкой':'Поделиться',icon:'share-outline',disabled,onPress:()=>void action('share')},
   {id:'external',label:Platform.OS==='web'?'Открыть исходную ссылку в браузере':'Открыть в браузере',icon:'open-outline',disabled,onPress:()=>void action('external')});
 }else if(frame.kind==='entity')actions.push({id:'link',label:'Ссылка',icon:'link-outline',onPress:()=>void action('link'),disabled,busy});
 else if(frame.kind==='html'){
  actions.push({id:'download',label:'Скачать',icon:'download-outline',onPress:()=>void action('download'),disabled,busy});
  if(frame.payload.link)actions.push({id:'link',label:'Ссылка',icon:'link-outline',onPress:()=>void action('link'),disabled,busy});
  const target=frame.payload.artifact.entity&&parseEntityLink(frame.payload.artifact.entity.url);
  if(target&&onOpen)actions.push({id:'entity',label:'Открыть карточку',icon:'open-outline',disabled,onPress:()=>{if(frame.payload.expectedUserId===userId&&frame.payload.isCurrent?.()!==false)onOpen(target,frame.title);}});
 }
 actions.push({id:'close',label:'Закрыть просмотр',icon:'close-outline',onPress:()=>{operation.current?.abort();onClose();}});
 let domain:string|undefined;
 if(frame.kind==='web'){try{const host=new URL(frame.currentUrl).host;domain=Platform.OS==='web'?`Исходный сайт: ${host}`:host}catch{}}
 return <View testID="entity-card-viewer" style={{flex:1}}>
  <HelpViewerLayout testIDPrefix="entity-card" title={frame.kind==='web'?'Просмотр':frame.title} eyebrow={domain} onBack={onBack} backLabel={state.frames.length>1?'Назад к предыдущему просмотру':'Закрыть просмотр'} actions={actions} menuOpen={menu} onMenuOpenChange={changeMenu} topInset={topInset} bottomInset={bottomInset}>{children}</HelpViewerLayout>
  {notice?<View pointerEvents="none" style={{position:'absolute',left:16,right:16,bottom:bottomInset+16,alignItems:'center'}}><Text accessibilityLiveRegion="polite" style={{backgroundColor:c.panel,color:c.text,borderRadius:12,paddingHorizontal:14,paddingVertical:10,fontSize:13}}>{notice}</Text></View>:null}
 </View>;
}
