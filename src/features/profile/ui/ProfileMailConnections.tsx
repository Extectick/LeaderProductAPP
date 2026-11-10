import React,{useCallback,useRef,useState} from 'react';
import {AppState,Linking,Pressable,View} from 'react-native';
import {ActivityIndicator,Text} from 'react-native-paper';
import {useFocusEffect} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {useAppSurfaceTheme} from '@/components/ui/appSurfaceTokens';
import {ConnectionAction,ConnectionField} from './ConnectionPrimitives';
import {ConnectionDialog} from './ConnectionDialog';
import {loadMailConnections,saveMailConnection,removeMailConnection,type MailConnection,type MailProvider} from '../api/mailConnections';
const providers=[{id:'mail',label:'Mail.ru',help:'https://help.mail.ru/mail/login/mailer/'},{id:'yandex',label:'Яндекс',help:'https://yandex.ru/support/yandex-360/customers/mail/ru/mail-clients/others'}] as const;
export function ProfileMailConnections({userId}:{userId:number}){
 const t=useAppSurfaceTheme(),[rows,setRows]=useState<MailConnection[]>([]),[loading,setLoading]=useState(true),[editing,setEditing]=useState(false),[provider,setProvider]=useState<MailProvider|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const request=useRef<AbortController|null>(null),epoch=useRef(0),busyRef=useRef(false);
 const clear=()=>{setPassword('');setEmail('');setProvider(null);setEditing(false);};
 useFocusEffect(useCallback(()=>{const version=++epoch.current,controller=new AbortController();request.current=controller;setRows([]);setLoading(true);setError('');clear();void loadMailConnections(userId,controller.signal).then(data=>{if(version===epoch.current)setRows(data);}).catch(e=>{if(version===epoch.current&&!controller.signal.aborted)setError(e.message);}).finally(()=>{if(version===epoch.current)setLoading(false);});const sub=AppState.addEventListener('change',state=>{if(state!=='active'){setPassword('');setEditing(false);}});return()=>{epoch.current++;request.current?.abort();busyRef.current=false;setBusy(false);clear();sub.remove();};},[userId,reload]));
 async function mutate(action:(signal:AbortSignal)=>Promise<void>){if(busyRef.current)return;busyRef.current=true;const version=++epoch.current;request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');try{await action(controller.signal);if(version===epoch.current){const next=await loadMailConnections(userId,controller.signal);if(version===epoch.current){setRows(next);clear();}}}catch(e){if(version===epoch.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Не удалось выполнить действие.');}finally{if(version===epoch.current){busyRef.current=false;setBusy(false);}}}
 async function connect(){if(!provider)return;const secret=password;setPassword('');await mutate(async signal=>{await saveMailConnection(userId,provider,email.trim(),secret,signal);});}
 if(loading)return <ActivityIndicator size="small" color={t.accent} accessibilityLabel="Загрузка подключений почты"/>;
 return <View style={{gap:12}}>
  {error&&!editing?<Text accessibilityRole="alert" style={{color:t.danger}}>{error}</Text>:null}
  {rows.map(row=><View key={row.provider} style={{flexDirection:'row',alignItems:'center',gap:8,minHeight:44}}><Text numberOfLines={1} style={{flex:1,color:t.text,fontSize:14}}>{row.email}</Text><Text style={{color:t.green,fontSize:12}}>Подключено</Text><ConnectionAction compact mode="text" textColor={t.danger} disabled={busy} onPress={()=>void mutate(signal=>removeMailConnection(userId,row.provider,signal))}>Отвязать</ConnectionAction></View>)}
  {rows.length<2?<ConnectionAction compact mode="text" textColor={t.accentText} disabled={busy} style={{alignSelf:'flex-start'}} onPress={()=>{setError('');setProvider(null);setEditing(true);}}>{rows.length?'Добавить':'Подключить'}</ConnectionAction>:null}
  {error&&!rows.length&&!editing?<ConnectionAction compact mode="text" onPress={()=>setReload(x=>x+1)}>Повторить</ConnectionAction>:null}
  {editing?<ConnectionDialog visible title={provider?`Подключить ${providers.find(p=>p.id===provider)?.label}`:'Выберите провайдера'} busy={busy} onClose={()=>{if(!busyRef.current){clear();setError('');}}}>
   {error?<Text accessibilityRole="alert" style={{color:t.danger}}>{error}</Text>:null}
   {!provider?providers.filter(p=>!rows.some(row=>row.provider===p.id)).map(p=><Pressable key={p.id} accessibilityRole="button" onPress={()=>setProvider(p.id)} style={({pressed})=>({flexDirection:'row',alignItems:'center',gap:12,minHeight:52,backgroundColor:pressed?t.soft:'transparent'})}><Ionicons name="mail-outline" size={22} color={t.muted}/><Text style={{flex:1,color:t.text}}>{p.label}</Text><Ionicons name="chevron-forward" size={20} color={t.muted}/></Pressable>):<>
    <ConnectionField label="Почта" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!busy} maxLength={254}/>
    <ConnectionField label="Пароль приложения" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" editable={!busy} maxLength={512}/>
    <ConnectionAction compact mode="text" onPress={()=>void Linking.openURL(providers.find(p=>p.id===provider)!.help)}>Как получить пароль</ConnectionAction>
    <ConnectionAction disabled={busy||!email.trim()||!password} loading={busy} onPress={()=>void connect()}>Подключить</ConnectionAction>
   </>}
  </ConnectionDialog>:null}
 </View>;
}
