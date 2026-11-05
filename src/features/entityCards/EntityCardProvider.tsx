import React,{lazy,Suspense,useCallback,useContext,useEffect,useMemo,useReducer,useRef} from 'react';
import {BackHandler,Keyboard,Platform} from 'react-native';
import {AuthContext} from '@/context/AuthContext';
import {API_BASE_URL} from '@/utils/config';
import {getProfileGate} from '@/utils/profileGate';
import {normalizeEntityTarget,parseEntityLink,type EntityTarget} from '../../shared/entityLinks';
import {EntityCardContext} from './EntityCardContext';
import {entityCardReducer,initialEntityCardState} from './entityCardState';
import {takeEntityLinkIntent} from '../../shared/entityLinkIntent';
import type {EntityCardHostProps} from './EntityCardHost.types';

// Defer the card/profile module graph until first use, without fetching a remote JS chunk.
const EntityCardHost=lazy<React.ComponentType<EntityCardHostProps>>(async()=>({default:require('./EntityCardHost').default}));

/** App-wide presentation only: underlying routes, drafts and chat lists remain mounted. */
export function EntityCardProvider({children}:{children:React.ReactNode}){
 const auth=useContext(AuthContext);
 const account=auth?.isAuthenticated&&auth.profile?.id&&getProfileGate(auth.profile)==='active'?`${API_BASE_URL}:${auth.profile.id}`:'';
 const [state,dispatch]=useReducer(entityCardReducer,initialEntityCardState);
 const currentAccount=useRef(account);currentAccount.current=account;
 const scrollOffsets=useRef(new Map<number,number>());
 useEffect(()=>{scrollOffsets.current.clear();dispatch({type:'account',account});},[account]);
 const visible=!!account&&state.account===account&&state.frames.length>0;
 useEffect(()=>{if(!state.frames.length)scrollOffsets.current.clear();},[state.frames.length]);
 const close=useCallback(()=>{Keyboard.dismiss();dispatch({type:'close'});},[]);
 const back=useCallback(()=>{Keyboard.dismiss();dispatch({type:'back'});},[]);
 const openEntity=useCallback((value:EntityTarget,title?:string)=>{
  const target=normalizeEntityTarget(value),scope=currentAccount.current;
  if(!target||!scope)return false;
  dispatch({type:'open',account:scope,target,title});Keyboard.dismiss();return true;
 },[]);
 const openEntityLink=useCallback((url:string,title?:string)=>{const target=parseEntityLink(url);return !!target&&openEntity(target,title);},[openEntity]);
 useEffect(()=>{
  if(!account)return;
  const url=takeEntityLinkIntent();if(url)openEntityLink(url);
 },[account,openEntityLink]);
 const onTitle=useCallback((key:number,title:string)=>dispatch({type:'title',key,title}),[]);
 const onScroll=useCallback((key:number,offset:number)=>{if(Number.isFinite(offset))scrollOffsets.current.set(key,Math.max(0,offset));},[]);
 const onConnect=useCallback((baseKey:string)=>dispatch({type:'connect',baseKey}),[]);
 useEffect(()=>{
  if(!visible)return;
  const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{back();return true;});
  if(Platform.OS!=='web')return()=>subscription.remove();
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();back();}};
  window.addEventListener('keydown',onKey,true);
  return()=>{subscription.remove();window.removeEventListener('keydown',onKey,true);};
 },[back,visible]);
 const navigation=useMemo(()=>({isOpen:visible,openEntity,openEntityLink,close,back}),[visible,openEntity,openEntityLink,close,back]);
 const session=state.session;
 return <EntityCardContext.Provider value={navigation}>
  {children}
  {visible?<Suspense fallback={null}><EntityCardHost key={session} state={{...state,frames:state.frames.map(frame=>({...frame,scrollOffset:scrollOffsets.current.get(frame.key)??frame.scrollOffset}))}} userId={auth!.profile!.id}
   onClose={close} onBack={back} onOpen={openEntity}
   onDismiss={()=>dispatch({type:'dismissed',session})}
   onTitle={onTitle} onScroll={onScroll} onConnect={onConnect}/></Suspense>:null}
 </EntityCardContext.Provider>;
}
