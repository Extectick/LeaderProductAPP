import React,{useContext,useEffect,useRef} from 'react';
import {ActivityIndicator,Pressable,Text,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {AuthContext} from '@/context/AuthContext';
import {useEntityCards} from '@/src/features/entityCards/EntityCardContext';
import {hasEntityLinkIntent,queueEntityLinkIntent,takeEntityLinkIntent} from '@/src/shared/entityLinkIntent';
import {parseEntityLink} from '@/src/shared/entityLinks';

/** External links land here briefly; cards still render above the previous route or app home. */
export default function EntityLinkLanding(){
 const router=useRouter(),navigation=useEntityCards(),auth=useContext(AuthContext),handled=useRef(false),queued=useRef(false),hadIntent=useRef(hasEntityLinkIntent());
 const {url}=useLocalSearchParams<{url?:string}>();
 const valid=typeof url==='string'?!!parseEntityLink(url):hadIntent.current||navigation.isOpen;
 useEffect(()=>{
  if(!queued.current&&typeof url==='string'&&valid){queueEntityLinkIntent(url);queued.current=true;}
  if(handled.current||!auth?.isAuthenticated||auth.isLoading||!valid)return;
  const pending=takeEntityLinkIntent();
  if(pending&&!navigation.openEntityLink(pending))return;
  handled.current=true;
  if(router.canGoBack())router.back();else router.replace('/home');
 },[auth?.isAuthenticated,auth?.isLoading,navigation,router,valid,url]);
 return <View style={{flex:1,alignItems:'center',justifyContent:'center',padding:24,gap:16}}>
  {valid?<><ActivityIndicator/><Text>Открываю карточку…</Text></>:<><Text>Ссылка недействительна или не поддерживается этой версией приложения.</Text><Pressable accessibilityRole="button" onPress={()=>router.replace('/home')} style={{padding:16}}><Text>На главную</Text></Pressable></>}
 </View>;
}
