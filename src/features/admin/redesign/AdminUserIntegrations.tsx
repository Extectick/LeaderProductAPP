import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Platform,Pressable,Text,TextInput,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpTheme} from '../../help/helpTheme';
import {useAdminData,useAdminAction,type AdminUser} from './AdminDataContext';
import {DesignButton,DesignChoice,DesignEditor,DesignEmpty,DesignGroup,DesignHero,DesignHint,DesignRow,DesignSheet} from './AdminDesignPrimitives';

export default function AdminUserIntegrations({user,draft,onChange}:{user:AdminUser;draft:AdminUser;onChange:(patch:Partial<AdminUser>)=>void}) {
  const t=useHelpTheme();
  const {onecPhysicalPersons,onecUsers,loadOnec,resetPassword}=useAdminData();
  const [onecLoading,setOnecLoading]=useState(true),[onecError,setOnecError]=useState('');
  const load=()=>{setOnecLoading(true);setOnecError('');loadOnec().catch(error=>setOnecError(error.message||'Не удалось загрузить справочник 1С')).finally(()=>setOnecLoading(false));};
  useEffect(load,[loadOnec]);
  const [picker,setPicker]=useState<'user'|'person'|null>(null),[search,setSearch]=useState(''),[resetOpen,setResetOpen]=useState(false),[resetDone,setResetDone]=useState(false);
  const selectedUser=onecUsers.find(item=>item.guid===draft.onecUserGuid),selectedPerson=onecPhysicalPersons.find(item=>item.guid===draft.onecPhysicalPersonGuid);
  const accounts=draft.channelAccounts;
  const userName=selectedUser?.name||draft.onecUserName,personName=selectedPerson?.name||draft.onecPhysicalPersonName;
  const entries=(picker==='user'?onecUsers:onecPhysicalPersons).filter(item=>(item.name+' '+item.guid+('physicalPersonName' in item?item.physicalPersonName:'')).toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'))).sort((a,b)=>Number(b.name.includes(draft.lastName))-Number(a.name.includes(draft.lastName)));
  const openPicker=(kind:'user'|'person')=>{setSearch('');setPicker(kind);};
  return <View style={{marginHorizontal:-16}}>
    <DesignGroup title="Привязка к 1С">
      <DesignChoice title="Пользователь 1С" value={userName||draft.onecUserGuid||'Выбрать пользователя'} onPress={()=>openPicker('user')}/>
      <DesignChoice title="Физическое лицо 1С" value={personName||draft.onecPhysicalPersonGuid||'Выбрать физическое лицо'} onPress={()=>openPicker('person')}/>
    </DesignGroup>
    <DesignGroup title="Подключения">
      <View style={{flexDirection:'row',alignItems:'center',gap:12,padding:16,minHeight:64}}><Ionicons name="notifications-outline" size={22} color={t.accent}/><Text style={{color:t.text,fontSize:15,flex:1}}>Уведомления</Text><Text style={{color:t.muted,fontSize:12}}>{draft.channels.push?'Подключены':'Не подключены'}</Text></View>
      {([{key:'telegram',title:'Telegram',icon:'paper-plane-outline',id:accounts?.telegramUserId},{key:'max',title:'MAX',icon:'chatbubble-outline',id:accounts?.maxUserId}] as const).map(item=><View key={item.key} style={{flexDirection:'row',alignItems:'center',gap:12,padding:16,minHeight:76}}><Ionicons name={item.icon} size={22} color={t.accent}/><View style={{flex:1,gap:5}}><Text style={{color:t.text,fontSize:15}}>{item.title}</Text><Text selectable style={{color:t.muted,fontSize:13,lineHeight:19}}>{item.id?`ID: ${item.id}`:'Не подключён'}</Text></View>{!!item.id&&<Ionicons name="checkmark-circle-outline" size={21} color={t.green}/>}</View>)}
    </DesignGroup>
    <DesignGroup title="Безопасность"><DesignChoice title="Пароль приложения" value={resetDone?'Пароль сброшен · Сбросить снова':'Сбросить пароль'} onPress={()=>setResetOpen(true)}/></DesignGroup>
    {resetDone&&<DesignHint>Новый пароль установлен. Пароль учётной записи 1С не изменён.</DesignHint>}
    {picker&&<DesignEditor caption="Привязка к 1С" title={picker==='user'?'Пользователи 1С':'Физические лица 1С'} onClose={()=>setPicker(null)}>
      <View style={{marginHorizontal:16,marginBottom:12,paddingHorizontal:16,backgroundColor:t.panel,borderRadius:24,height:48,flexDirection:'row',alignItems:'center',gap:10}}><Ionicons name="search-outline" size={21} color={t.muted}/><TextInput accessibilityLabel="Поиск в справочнике 1С" value={search} onChangeText={setSearch} placeholder="Поиск по ФИО" placeholderTextColor={t.muted} autoCorrect={false} style={{flex:1,minWidth:0,color:t.text,fontSize:16,padding:0,...Platform.select({web:{outlineStyle:'none'} as any})}}/>{!!search&&<Pressable accessibilityRole="button" accessibilityLabel="Очистить поиск 1С" onPress={()=>setSearch('')}><Ionicons name="close" size={21} color={t.muted}/></Pressable>}</View>
      {onecLoading&&<ActivityIndicator style={{padding:20}} color={t.accent}/>}
      {!!onecError&&<><DesignHint error>{onecError}</DesignHint><DesignButton label="Повторить загрузку 1С" onPress={load}/></>}
      {!search&&<DesignRow title="Без привязки" subtitle="Не связывать с учётной записью" icon="unlink-outline" onPress={()=>{onChange(picker==='user'?{onecUserGuid:null,onecUserName:null}:{onecPhysicalPersonGuid:null,onecPhysicalPersonName:null});setPicker(null);}}/>}
      {entries.map(item=>{const selected=item.guid===(picker==='user'?draft.onecUserGuid:draft.onecPhysicalPersonGuid);return <DesignRow key={item.guid} title={item.name} subtitle={'inactive' in item&&item.inactive?'Неактивный пользователь 1С':picker==='user'?'Пользователь 1С':'Физическое лицо 1С'} icon="person-outline" trailing={selected?<Ionicons name="checkmark-circle" size={23} color={t.accent}/>:undefined} onPress={()=>{
        if(picker==='user'){const selected=onecUsers.find(candidate=>candidate.guid===item.guid)!;onChange({onecUserGuid:selected.guid,onecUserName:selected.name,...(!draft.onecPhysicalPersonGuid&&selected.physicalPersonGuid?{onecPhysicalPersonGuid:selected.physicalPersonGuid,onecPhysicalPersonName:selected.physicalPersonName}:{})});}
        else onChange({onecPhysicalPersonGuid:item.guid,onecPhysicalPersonName:item.name});
        setPicker(null);
      }}/>;})}
      {!onecLoading&&!onecError&&!entries.length&&<DesignEmpty title="В справочнике ничего не найдено" description="Проверьте ФИО или введите часть имени" icon="person-outline"/>}
    </DesignEditor>}
    {resetOpen&&<PasswordReset user={user} onClose={()=>setResetOpen(false)} onReset={async password=>{await resetPassword(user.id,password);setResetDone(true);setResetOpen(false);}}/>}
  </View>;
}

function PasswordReset({user,onClose,onReset}:{user:AdminUser;onClose:()=>void;onReset:(password:string)=>Promise<void>}) {
  const t=useHelpTheme();
  const [password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[visible,setVisible]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
  const {busy,run}=useAdminAction(setError);
  const validate=()=>{if(password.trim().length<6){setError('Новый пароль должен содержать минимум 6 символов');return;}if(password!==repeat){setError('Пароли не совпадают');return;}setError('');setConfirm(true);};
  const field=(title:string,value:string,setValue:(value:string)=>void)=><View style={{paddingHorizontal:16,paddingVertical:14,gap:5}}><Text style={{color:t.muted,fontSize:12}}>{title}</Text><View style={{flexDirection:'row',alignItems:'center',gap:8}}><TextInput accessibilityLabel={title} value={value} onChangeText={value=>{setValue(value);setError('');}} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" placeholder={title} placeholderTextColor={t.muted} style={{flex:1,minWidth:0,fontSize:16,lineHeight:24,color:t.text,padding:0,...Platform.select({web:{outlineStyle:'none'} as any})}}/><Pressable accessibilityRole="button" accessibilityLabel={visible?'Скрыть пароль':'Показать пароль'} onPress={()=>setVisible(!visible)} style={{width:44,height:40,alignItems:'center',justifyContent:'center'}}><Ionicons name={visible?'eye-off-outline':'eye-outline'} size={22} color={t.muted}/></Pressable></View></View>;
  const close=()=>{setPassword('');setRepeat('');onClose();};
  return <DesignEditor caption="Безопасность" title="Новый пароль" onClose={close} error={error} busy={busy}>
    <DesignHero title={`${user.lastName} ${user.firstName}`} subtitle="Сброс пароля для входа в приложение" icon="lock-closed-outline"/>
    <DesignGroup title="Пароль приложения">{field('Новый пароль',password,setPassword)}{field('Повторите пароль',repeat,setRepeat)}</DesignGroup>
    <DesignHint>Минимум 6 символов. Пароль учётной записи 1С не изменится.</DesignHint>
    <DesignButton label={busy?'Устанавливаем пароль…':'Сбросить пароль'} disabled={busy} onPress={validate}/>
    {confirm&&<DesignSheet title="Сбросить пароль?" onClose={()=>setConfirm(false)}><DesignHint>Новый пароль будет установлен для входа в приложение пользователя {user.lastName} {user.firstName}.</DesignHint><DesignButton label="Подтвердить сброс" disabled={busy} onPress={()=>{setConfirm(false);void run(async()=>{await onReset(password);setPassword('');setRepeat('');});}}/></DesignSheet>}
  </DesignEditor>;
}
