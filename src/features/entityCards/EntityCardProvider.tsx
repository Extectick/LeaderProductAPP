import React,{lazy,Suspense,useCallback,useContext,useEffect,useMemo,useReducer,useRef} from 'react';
import {BackHandler,Keyboard,Platform} from 'react-native';
import {AuthContext} from '@/context/AuthContext';
import {API_BASE_URL} from '@/utils/config';
import {normalizeEntityTarget,parseEntityLink,type EntityTarget} from '../../shared/entityLinks';
import {EntityCardContext,type EntityCardNavigation} from './EntityCardContext';
import {entityCardReducer,initialEntityCardState} from './entityCardState';
import {takeEntityLinkIntent} from '../../shared/entityLinkIntent';
import type {EntityCardHostProps} from './EntityCardHost.types';
import {useHelpOriginTracking} from '../help/useHelpOriginTracking';
import {normalizeWebUrl} from '../webPages/webPagePolicy';
import type {ViewerHtmlPayload,ViewerPageControls} from '../viewer/viewerTypes';

// Defer the card/profile module graph until first use, without fetching a remote JS chunk.
const EntityCardHost=lazy<React.ComponentType<EntityCardHostProps>>(async()=>({default:require('./EntityCardHost').default}));

/** App-wide presentation only: underlying routes, drafts and chat lists remain mounted. */
export function EntityCardProvider({children}:{children:React.ReactNode}){
 const auth=useContext(AuthContext);
 // Opening a read-only panel does not require selecting an active profile type.
 // Employee/profile permissions are enforced by the existing authenticated API.
 const blocked=auth?.profile?.profileStatus==='BLOCKED';
 const account=auth?.isAuthenticated&&auth.profile?.id&&!blocked?`${API_BASE_URL}:${auth.profile.id}`:'';
 const status=blocked?'blocked':account?'ready':'authentication-required';
 const [state,dispatch]=useReducer(entityCardReducer,initialEntityCardState);
 const currentAccount=useRef(account);currentAccount.current=account;
 const scrollOffsets=useRef(new Map<number,number>());
 const pageControls=useRef(new Map<number,ViewerPageControls>());
 const menuDismiss=useRef<{key:number;handler:()=>boolean}|null>(null);
 useEffect(()=>{scrollOffsets.current.clear();pageControls.current.clear();menuDismiss.current=null;dispatch({type:'account',account});},[account]);
 const visible=!!account&&state.account===account&&state.frames.length>0;
 const activeFrame=visible&&!state.closing?state.frames.at(-1):undefined;
 const viewerScope=useRef({account,state});viewerScope.current={account,state};
 const activeTarget=activeFrame?.kind==='entity'?activeFrame.target:activeFrame?.kind==='html'&&activeFrame.payload.artifact.entity?parseEntityLink(activeFrame.payload.artifact.entity.url)??undefined:undefined;
 useHelpOriginTracking(account,activeTarget);
 useEffect(()=>{if(!state.frames.length)scrollOffsets.current.clear();},[state.frames.length]);
 const close=useCallback(()=>{Keyboard.dismiss();dispatch({type:'close'});},[]);
 const back=useCallback(()=>{
  const current=viewerScope.current,frame=current.state.frames.at(-1);
  if(!frame||!current.account||current.account!==current.state.account||current.state.closing)return;
  if(menuDismiss.current?.key===frame.key&&menuDismiss.current.handler())return;
  const controls=frame.kind==='web'?pageControls.current.get(frame.key):undefined;
  if(controls?.canGoBack){controls.goBack();return;}
  Keyboard.dismiss();dispatch({type:'back'});
 },[]);
 const openEntity=useCallback((value:EntityTarget,title?:string)=>{
  const target=normalizeEntityTarget(value),scope=currentAccount.current;
  if(!target||!scope)return false;
  dispatch({type:'open',account:scope,target,title});Keyboard.dismiss();return true;
 },[]);
 const openEntityLink=useCallback((url:string,title?:string)=>{const target=parseEntityLink(url);return !!target&&openEntity(target,title);},[openEntity]);
 const openWeb=useCallback((value:string,title?:string)=>{
  const url=normalizeWebUrl(value),scope=currentAccount.current;if(!url||!scope)return false;
  dispatch({type:'web',account:scope,url,title});Keyboard.dismiss();return true;
 },[]);
 const openHtml=useCallback((payload:ViewerHtmlPayload)=>{
  const scope=currentAccount.current;
  if(!scope||scope!==`${API_BASE_URL}:${payload.expectedUserId}`||!payload.artifact.full||payload.isCurrent?.()===false)return false;
  dispatch({type:'html',account:scope,payload});Keyboard.dismiss();return true;
 },[]);
 const releaseHtml=useCallback((scopeId:string)=>dispatch({type:'release-html',scopeId}),[]);
 useEffect(()=>{
  if(!account)return;
  const url=takeEntityLinkIntent();if(url)openEntityLink(url);
 },[account,openEntityLink]);
 const onTitle=useCallback((key:number,title:string)=>dispatch({type:'title',key,title}),[]);
 const onScroll=useCallback((key:number,offset:number)=>{if(Number.isFinite(offset))scrollOffsets.current.set(key,Math.max(0,offset));},[]);
 const onConnect=useCallback((baseKey:string)=>dispatch({type:'connect',baseKey}),[]);
 const onPageControls=useCallback((key:number,controls:ViewerPageControls|null)=>{
  if(!controls){pageControls.current.delete(key);return;}
  const current=viewerScope.current;
  if(current.account!==currentAccount.current||current.account!==current.state.account||current.state.closing||current.state.frames.at(-1)?.key!==key)return;
  pageControls.current.set(key,controls);
 },[]);
 const onWebLocation=useCallback((key:number,url:string)=>{
  const current=viewerScope.current;
  if(current.account!==currentAccount.current||current.account!==current.state.account||current.state.closing||current.state.frames.at(-1)?.key!==key)return;
  dispatch({type:'web-location',key,url});
 },[]);
 const onRegisterMenuDismiss=useCallback((key:number,handler:(()=>boolean)|null)=>{
  if(!handler){if(menuDismiss.current?.key===key)menuDismiss.current=null;return;}
  if(viewerScope.current.state.frames.at(-1)?.key===key)menuDismiss.current={key,handler};
 },[]);
 const onReloadPage=useCallback((key:number)=>{
  const current=viewerScope.current,controls=pageControls.current.get(key);
  if(!controls||current.account!==currentAccount.current||current.account!==current.state.account||current.state.closing||current.state.frames.at(-1)?.key!==key)return false;
  controls.reload();return true;
 },[]);
 useEffect(()=>{
  if(!visible)return;
  const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{back();return true;});
  if(Platform.OS!=='web')return()=>subscription.remove();
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();back();}};
  window.addEventListener('keydown',onKey,true);
  return()=>{subscription.remove();window.removeEventListener('keydown',onKey,true);};
 },[back,visible]);
 const navigation=useMemo<EntityCardNavigation>(()=>({isOpen:visible,status,openEntity,openEntityLink,openWeb,openHtml,releaseHtml,close,back}),[visible,status,openEntity,openEntityLink,openWeb,openHtml,releaseHtml,close,back]);
 const session=state.session;
 return <EntityCardContext.Provider value={navigation}>
  {children}
  {visible?<Suspense fallback={null}><EntityCardHost key={session} state={{...state,frames:state.frames.map(frame=>({...frame,scrollOffset:scrollOffsets.current.get(frame.key)??frame.scrollOffset}))}} userId={auth!.profile!.id}
   onClose={close} onBack={back} onOpen={openEntity}
   onDismiss={()=>dispatch({type:'dismissed',session})}
   onTitle={onTitle} onScroll={onScroll} onConnect={onConnect} onPageControls={onPageControls} onWebLocation={onWebLocation} onRegisterMenuDismiss={onRegisterMenuDismiss} onReloadPage={onReloadPage}/></Suspense>:null}
 </EntityCardContext.Provider>;
}
