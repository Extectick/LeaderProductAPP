import {useCallback,useContext,useEffect,useRef,useState} from 'react';
import type {ImageSource} from 'expo-image';
import {AuthContext} from '@/context/AuthContext';
import {avatarAsset,loadAvatar,peekAvatar} from './avatarSource';

export function useAvatarSource({uri,identityKey}:{uri:string|null;identityKey:string|number}) {
  const auth=useContext(AuthContext), viewerId=auth?.isAuthenticated ? auth.profile?.id || 0 : 0;
  const key=`${viewerId}:${identityKey}:${uri||''}`;
  const current=useRef(key);current.current=key;
  const retry=useRef<string|null>(null);
  const [state,setState]=useState<{key:string;source:ImageSource|null}>(()=>({key,source:uri?peekAvatar(uri,viewerId):null}));
  // Protected routes may never fall back to an unauthenticated remote image.
  const protectedPath=!!uri&&/\/users\/\d+\/avatars\//.test(uri);
  const allowed=!!uri&&(!protectedPath||!!avatarAsset(uri,viewerId));
  const initial=allowed?peekAvatar(uri!,viewerId):null;
  const source=state.key===key?state.source:initial;
  useEffect(()=>{
    let alive=true;retry.current=null;
    if(!allowed){setState({key,source:null});return;}
    void loadAvatar(uri!,viewerId).then(value=>{if(alive&&current.current===key)setState({key,source:value});});
    return()=>{alive=false;};
  },[key,allowed,uri,viewerId]);
  const refresh=useCallback(async()=>{
    if(!uri||!avatarAsset(uri,viewerId)||retry.current===key)return false;
    retry.current=key;
    const next=await loadAvatar(uri,viewerId,true);
    if(current.current!==key||!next)return false;
    setState({key,source:next});return true;
  },[key,uri,viewerId]);
  return {source:allowed?source:null,loading:allowed&&!source,refresh};
}
