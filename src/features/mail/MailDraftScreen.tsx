import React,{useContext,useEffect,useRef,useState} from 'react';
import {ScrollView,View} from 'react-native';
import {ActivityIndicator,Appbar,Text} from 'react-native-paper';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {AuthContext} from '@/context/AuthContext';
import {useAppSurfaceTheme} from '@/components/ui/appSurfaceTokens';
import {ConnectionAction} from '@/src/features/profile/ui/ConnectionPrimitives';
import {loadMailDraft,sendMailDraft,type MailDraft} from '@/src/features/profile/api/mailConnections';
export default function MailDraftScreen(){
 const t=useAppSurfaceTheme(),router=useRouter(),{draftId}=useLocalSearchParams<{draftId?:string}>(),userId=useContext(AuthContext)?.profile?.id;
 const [draft,setDraft]=useState<MailDraft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[uncertain,setUncertain]=useState(false);
 const epoch=useRef(0),request=useRef<AbortController|null>(null),sending=useRef(false);
 useEffect(()=>{const version=++epoch.current,controller=new AbortController();request.current=controller;setDraft(null);setError('');setUncertain(false);setBusy(true);if(!userId||!draftId||!/^[a-f0-9-]{36}$/i.test(draftId)){setError('Письмо недоступно.');setBusy(false);return;}void loadMailDraft(userId,draftId,controller.signal).then(value=>{if(version===epoch.current)setDraft(value);}).catch(e=>{if(version===epoch.current&&!controller.signal.aborted)setError(e.message);}).finally(()=>{if(version===epoch.current)setBusy(false);});return()=>{epoch.current++;request.current?.abort();sending.current=false;};},[userId,draftId,reload]);
 async function send(){if(!userId||!draft||sending.current||uncertain)return;sending.current=true;const version=epoch.current,controller=new AbortController();request.current=controller;setBusy(true);setError('');try{const value=await sendMailDraft(userId,draft,controller.signal);if(version===epoch.current)setDraft(value);}catch(e){if(version===epoch.current&&!controller.signal.aborted){setUncertain(true);setError(e instanceof Error?e.message:'Не удалось проверить отправку.');}}finally{if(version===epoch.current){sending.current=false;setBusy(false);}}}
 const close=()=>{if(router.canGoBack())router.back();else router.replace('/services/help');};
 return <View style={{flex:1,backgroundColor:t.background}}><Appbar.Header elevated={false} style={{backgroundColor:t.headerSurface}}><Appbar.Content title="Письмо" titleStyle={{color:t.text}}/><Appbar.Action icon="close" accessibilityLabel="Закрыть письмо" onPress={close}/></Appbar.Header><ScrollView contentContainerStyle={{padding:20,gap:16,width:'100%',maxWidth:760,alignSelf:'center'}}>
  {busy&&!draft?<ActivityIndicator color={t.accent}/>:null}
  {error?<Text accessibilityRole="alert" style={{color:t.danger}}>{error}</Text>:null}
  {draft?<><Text style={{color:t.muted}}>От: {draft.from}</Text><Text selectable style={{color:t.text}}>Кому: {draft.to.join(', ')}</Text><Text selectable style={{color:t.text,fontSize:20,fontWeight:'600'}}>{draft.subject}</Text><Text selectable style={{color:t.text,fontSize:15,lineHeight:23}}>{draft.text}</Text>{draft.attachments.map(file=><Text key={file.id} style={{color:t.muted}}>📎 {file.name}</Text>)}
   {draft.status==='DRAFT'&&!uncertain?<ConnectionAction loading={busy} disabled={busy} onPress={()=>void send()}>Отправить</ConnectionAction>:null}
   {draft.status==='SENT'?<Text accessibilityLiveRegion="polite" style={{color:t.green}}>Принято почтовым сервером</Text>:null}
   {draft.status==='SENDING'?<Text style={{color:t.muted}}>Отправляется…</Text>:null}
   {draft.status==='FAILED'?<Text accessibilityRole="alert" style={{color:t.danger}}>Письмо не отправлено. Подключите почту заново и подготовьте новое письмо.</Text>:null}
   {draft.status==='UNKNOWN'?<Text style={{color:t.muted}}>Результат отправки неизвестен. Проверьте почту перед повторной отправкой.</Text>:null}
  </>:null}
  {(uncertain||error||draft?.status==='SENDING'||draft?.status==='UNKNOWN')?<ConnectionAction compact mode="text" disabled={busy} onPress={()=>setReload(x=>x+1)}>Обновить статус</ConnectionAction>:null}
 </ScrollView></View>;
}
