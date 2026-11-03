/** Admin directory/editor backed by the injected data model. */
import React, {useEffect, useState} from 'react';
import {FlatList, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useHelpTheme} from '../../help/helpTheme';
import {useAdminData,useAdminAction,type AdminUser} from './AdminDataContext';
import {Image,ActivityIndicator} from 'react-native';
import AdminUserIntegrations from './AdminUserIntegrations';
import {DesignButton,DesignChoice,DesignEditor,DesignSheet} from './AdminDesignPrimitives';

type User=AdminUser;
type Filter='all'|'pending'|'online'|'blocked';
const palette=['#3289FF','#B45A80','#728D3D','#7061BD','#CC8840','#3B9299'];
const nameOf=(user:User)=>`${user.lastName} ${user.firstName}`;
const initials=(user:User)=>`${user.firstName[0]??''}${user.lastName[0]??''}`;
const statusOf=(user:User)=>!user.hasEmployeeProfile?'Нет профиля сотрудника':user.employeeStatus==='PENDING'?'На проверке':user.employeeStatus==='BLOCKED'?'Доступ ограничен':'Профиль подтверждён';
const avatarColor=(user:User)=>palette[Math.abs(user.id)%palette.length];

function Avatar({user,size=50}:{user:User;size?:number}) {
  const t=useHelpTheme();
  return <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:avatarColor(user),alignItems:'center',justifyContent:'center'}}>
    {user.avatarUrl?<Image source={{uri:user.avatarUrl}} style={{width:size,height:size,borderRadius:size/2}}/>:<Text style={{color:'#FFFFFF',fontSize:size*.34,fontWeight:'600'}}>{initials(user)}</Text>}
    {user.isOnline&&<View style={{position:'absolute',right:1,bottom:1,width:12,height:12,borderRadius:6,backgroundColor:t.green,borderWidth:2,borderColor:t.background}}/>}
  </View>;
}

export default function AdminUsers({query,contentTop,filtersOpen,onCloseFilters,queuedUserId,onConsumeUser}:{
  query:string;contentTop:number;filtersOpen:boolean;onCloseFilters:()=>void;queuedUserId:number|null;onConsumeUser:()=>void;
}) {
  const {users,departments}=useAdminData();
  const t=useHelpTheme(),insets=useSafeAreaInsets();
  const [filter,setFilter]=useState<Filter>('all'),[department,setDepartment]=useState<number|null>(null);
  const [selected,setSelected]=useState<User|null>(null),[revision,setRevision]=useState(0),[notice,setNotice]=useState('');
  useEffect(()=>{if(queuedUserId){setSelected(users.find(user=>user.id===queuedUserId)??null);onConsumeUser();}},[queuedUserId]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),2600);return()=>clearTimeout(timer);},[notice]);
  const pendingCount=users.filter(user=>user.employeeStatus==='PENDING').length;
  const filtered=users.filter(user=>(nameOf(user)+' '+user.email+' '+user.id+' '+user.departmentName).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru').trim()))
    .filter(user=>filter==='all'||filter==='pending'&&user.employeeStatus==='PENDING'||filter==='online'&&user.isOnline||filter==='blocked'&&user.employeeStatus==='BLOCKED')
    .filter(user=>department===null||user.departmentId===department)
    .sort((a,b)=>Number(b.employeeStatus==='PENDING')-Number(a.employeeStatus==='PENDING'));
  const tint=(user:User)=>user.employeeStatus==='PENDING'?(t.dark?'#EBC06A':'#96600D'):user.employeeStatus==='BLOCKED'?t.danger:t.muted;
  const chip=(key:Filter,label:string)=><Pressable key={key} accessibilityRole="button" accessibilityState={{selected:filter===key}} accessibilityLabel={label} onPress={()=>setFilter(key)} style={({pressed})=>[s.chip,{backgroundColor:filter===key||pressed?t.soft:'transparent'}]}><Text style={{color:filter===key?t.accentText:t.muted,fontSize:13,fontWeight:filter===key?'600':'400'}}>{label}</Text></Pressable>;
  return <View style={{flex:1,backgroundColor:t.background}}>
    <FlatList data={filtered} extraData={revision} keyExtractor={user=>String(user.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop:contentTop+8,paddingBottom:insets.bottom+20,flexGrow:1}}
      renderItem={({item:user})=><Pressable accessibilityRole="button" accessibilityLabel={`Открыть профиль ${nameOf(user)}`} onPress={()=>setSelected(user)} style={({pressed,hovered}:any)=>[s.userRow,{backgroundColor:pressed||hovered?t.soft:'transparent'}]}>
        <Avatar user={user}/><View style={{flex:1,minWidth:0,gap:3}}>
          <Text numberOfLines={1} style={[s.userName,{color:t.text}]}>{nameOf(user)}</Text>
          <Text numberOfLines={1} style={{fontSize:14,lineHeight:20,color:t.muted}}>{user.role.displayName} · {user.departmentName}</Text>
          <View style={{flexDirection:'row',alignItems:'center',gap:5}}>{user.employeeStatus==='PENDING'?<Ionicons name="time-outline" size={13} color={tint(user)}/>:user.employeeStatus==='BLOCKED'?<Ionicons name="lock-closed-outline" size={13} color={tint(user)}/>:null}<Text style={{fontSize:12,lineHeight:17,color:tint(user)}}>{user.employeeStatus==='ACTIVE'?(user.isOnline?'В сети':user.lastSeenAt?`Был(а) ${new Date(user.lastSeenAt).toLocaleString('ru-RU')}`:'Не в сети'):statusOf(user)}</Text></View>
        </View><Ionicons name="chevron-forward" size={21} color={t.muted}/>
      </Pressable>}
      ListEmptyComponent={<View style={s.empty}><Ionicons name="people-outline" size={36} color={t.muted}/><Text style={[s.userName,{color:t.text}]}>Сотрудники не найдены</Text><Text style={{color:t.muted,textAlign:'center'}}>Измените поиск или условия фильтра</Text><Pressable accessibilityRole="button" onPress={()=>{setFilter('all');setDepartment(null);}}><Text style={{color:t.accentText,fontSize:15}}>Сбросить фильтры</Text></Pressable></View>}/>
    {!!notice&&<View pointerEvents="none" style={[s.toast,{backgroundColor:t.panel,bottom:insets.bottom+16}]}><Ionicons name="checkmark-circle" size={20} color={t.green}/><Text style={{color:t.text}}>{notice}</Text></View>}
    {filtersOpen&&<DesignSheet title="Фильтры пользователей" onClose={onCloseFilters}>
        <Text style={{color:t.muted,fontSize:13,paddingHorizontal:20,paddingBottom:12}}>{filtered.length} из {users.length} сотрудников · На проверке: {pendingCount}</Text>
        <Text style={[s.label,{color:t.muted}]}>СТАТУС</Text><View style={s.chips}>{chip('all','Все')}{chip('pending','На проверке')}{chip('online','В сети')}{chip('blocked','Ограничены')}</View>
        <Text style={[s.label,{color:t.muted}]}>ОТДЕЛ</Text><View style={s.chips}>{[{id:null,name:'Все отделы'},...departments].map(item=><Pressable key={String(item.id)} accessibilityRole="button" accessibilityState={{selected:department===item.id}} onPress={()=>setDepartment(item.id)} style={[s.chip,{backgroundColor:department===item.id?t.soft:t.panel}]}><Text style={{color:department===item.id?t.accentText:t.muted}}>{item.name}</Text></Pressable>)}</View>
        <Pressable accessibilityRole="button" onPress={onCloseFilters} style={[s.primary,{backgroundColor:t.accent}]}><Text style={s.primaryText}>Показать · {filtered.length}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={()=>{setFilter('all');setDepartment(null);}} style={{padding:16,alignItems:'center'}}><Text style={{color:t.accentText,fontSize:15}}>Сбросить фильтры</Text></Pressable>
    </DesignSheet>}
    {selected&&<AdminUserCard user={selected} onClose={()=>setSelected(null)} onSaved={message=>{setRevision(value=>value+1);setSelected(null);setNotice(message);}}/>}
  </View>;
}

function AdminUserCard({user,onClose,onSaved}:{user:User;onClose:()=>void;onSaved:(message:string)=>void}) {
  const {roles,departments,loadUser,saveUser,moderateUser}=useAdminData();
  const t=useHelpTheme();
  const [draft,setDraft]=useState(()=>({...user})),[picker,setPicker]=useState<'role'|'department'|null>(null),[confirm,setConfirm]=useState<'approve'|'block'|null>(null),[error,setError]=useState('');
  const [reason,setReason]=useState(''),[loaded,setLoaded]=useState(false),[original,setOriginal]=useState(user),[attempt,setAttempt]=useState(0),[statusPicker,setStatusPicker]=useState<'employeeStatus'|'clientStatus'|'supplierStatus'|null>(null);
  const {busy,run}=useAdminAction(setError);
  useEffect(()=>{let alive=true;setError('');loadUser(user).then(value=>{if(alive){setDraft(value);setOriginal(value);setLoaded(true);}}).catch(error=>{if(alive)setError(error.message||'Не удалось загрузить профиль');});return()=>{alive=false;};},[user.id,loadUser,attempt]);
  const valid=()=>{
    if(!draft.firstName.trim()){setError('Укажите имя');return false;}
    if(draft.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)){setError('Проверьте адрес электронной почты');return false;}
    return true;
  };
  const save=()=>{
    if(!valid())return;
    void run(async()=>{await saveUser({...draft,firstName:draft.firstName.trim(),lastName:draft.lastName.trim()},original);onSaved('Изменения сохранены');});
  };
  const moderate=()=>{if(!valid()){setConfirm(null);return;}const approved=confirm==='approve';void run(async()=>{await saveUser(draft,original);await moderateUser(draft,approved?'APPROVE':'REJECT',reason.trim());onSaved(approved?'Профиль подтверждён':'Доступ ограничен');});};
  const field=(label:string,key:'lastName'|'firstName'|'middleName'|'email'|'phone')=><View style={s.field}><Text style={{color:t.muted,fontSize:12}}>{label}</Text><TextInput accessibilityLabel={label} value={draft[key]} onChangeText={value=>{setDraft(current=>({...current,[key]:value}));setError('');}} keyboardType={key==='email'?'email-address':'default'} autoCapitalize={key==='email'?'none':'words'} style={[s.fieldInput,{color:t.text}]} placeholderTextColor={t.muted}/></View>;
  const choice=(label:string,value:string,type:'role'|'department')=><Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={()=>setPicker(type)} style={({pressed})=>[s.choice,{backgroundColor:pressed?t.soft:'transparent'}]}><View style={{flex:1,gap:4}}><Text style={{color:t.muted,fontSize:12}}>{label}</Text><Text style={{color:t.text,fontSize:16}}>{value}</Text></View><Ionicons name="chevron-forward" size={20} color={t.muted}/></Pressable>;
  return <DesignEditor caption="Профиль пользователя" title={`Сотрудник #${user.id}`} onClose={onClose} onSave={save} saveDisabled={!loaded} busy={busy} backLabel="Назад к пользователям" saveLabel="Сохранить профиль" error={loaded?error:undefined}>
      {!loaded?<View style={{padding:32,gap:16}}>{error?<><Text style={{color:t.danger}}>{error}</Text><DesignButton label="Повторить загрузку профиля" onPress={()=>setAttempt(value=>value+1)}/></>:<ActivityIndicator color={t.accent}/>}</View>:<View style={{paddingHorizontal:16}}>
        <View style={s.identity}><Avatar user={draft} size={76}/><Text style={[s.cardName,{color:t.text}]}>{nameOf(draft)}</Text><Text style={{fontSize:14,color:t.muted}}>{draft.role.displayName} · {draft.departmentName}</Text><View style={[s.status,{backgroundColor:t.soft}]}><Ionicons name={user.employeeStatus==='PENDING'?'time-outline':user.employeeStatus==='BLOCKED'?'lock-closed-outline':'checkmark-circle-outline'} size={15} color={user.employeeStatus==='PENDING'?(t.dark?'#EBC06A':'#96600D'):user.employeeStatus==='BLOCKED'?t.danger:t.green}/><Text style={{fontSize:12,color:user.employeeStatus==='PENDING'?(t.dark?'#EBC06A':'#96600D'):user.employeeStatus==='BLOCKED'?t.danger:t.green}}>{statusOf(user)}</Text></View></View>
        {user.employeeStatus==='PENDING'&&<View style={[s.review,{backgroundColor:t.soft}]}><Text style={[s.userName,{color:t.text}]}>Подтверждение профиля</Text><Text style={{color:t.muted,fontSize:14,lineHeight:20}}>Проверьте данные, отдел и роль сотрудника перед предоставлением доступа.</Text><View style={{flexDirection:'row',gap:8}}><Pressable accessibilityRole="button" onPress={()=>setConfirm('approve')} style={[s.reviewButton,{backgroundColor:t.accent}]}><Ionicons name="checkmark" size={19} color="#FFFFFF"/><Text style={{color:'#FFFFFF',fontWeight:'600'}}>Подтвердить</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>setConfirm('block')} style={[s.reviewButton,{backgroundColor:t.incoming}]}><Text style={{color:t.danger,fontWeight:'600'}}>Отклонить</Text></Pressable></View></View>}
        <Text style={[s.groupLabel,{color:t.muted}]}>ЛИЧНЫЕ ДАННЫЕ</Text><View style={[s.group,{backgroundColor:t.incoming}]}>{field('Фамилия','lastName')}{field('Имя','firstName')}{field('Отчество','middleName')}{field('Электронная почта','email')}{field('Телефон','phone')}</View>
        <Text style={[s.groupLabel,{color:t.muted}]}>РАБОТА И ДОСТУП</Text><View style={[s.group,{backgroundColor:t.incoming}]}>{draft.hasEmployeeProfile&&choice('Отдел',draft.departmentName,'department')}{choice('Роль',draft.role.displayName,'role')}<View style={s.choice}><View style={{flex:1,gap:4}}><Text style={{color:t.text,fontSize:16}}>Аккаунт активен</Text><Text style={{color:t.muted,fontSize:12}}>Доступ к приложению</Text></View><Switch accessibilityLabel="Аккаунт активен" value={draft.isActive} onValueChange={value=>setDraft(current=>({...current,isActive:value}))} thumbColor="#FFFFFF" trackColor={{false:t.line,true:t.accent}}/></View></View>
        {(draft.hasEmployeeProfile||draft.clientStatus||draft.supplierStatus)&&<><Text style={[s.groupLabel,{color:t.muted}]}>ПРОФИЛИ</Text><View style={[s.group,{backgroundColor:t.incoming}]}>{([{key:'employeeStatus',label:'Сотрудник'},{key:'clientStatus',label:'Клиент'},{key:'supplierStatus',label:'Поставщик'}] as const).filter(item=>draft[item.key]).map(item=><DesignChoice key={item.key} title={item.label} value={draft[item.key]==='ACTIVE'?'Активен':draft[item.key]==='PENDING'?'На проверке':'Заблокирован'} onPress={()=>setStatusPicker(item.key)}/>)}</View></>}
        <AdminUserIntegrations user={user} draft={draft} onChange={patch=>{setDraft(current=>({...current,...patch}));setError('');}}/>
        <Pressable accessibilityRole="button" onPress={save} style={[s.primary,{marginHorizontal:0,marginTop:24,backgroundColor:t.accent}]}><Text style={s.primaryText}>Сохранить изменения</Text></Pressable>
      </View>}
      {statusPicker&&<DesignSheet title="Статус профиля" onClose={()=>setStatusPicker(null)}>{([{key:'PENDING',label:'На проверке'},{key:'ACTIVE',label:'Активен'},{key:'BLOCKED',label:'Заблокирован'}] as const).map(item=><Pressable key={item.key} accessibilityRole="button" onPress={()=>{setDraft({...draft,[statusPicker]:item.key});setStatusPicker(null);}} style={s.option}><Text style={{color:t.text,fontSize:16}}>{item.label}</Text></Pressable>)}</DesignSheet>}
      {(picker!==null||confirm!==null)&&<DesignSheet title={picker==='role'?'Роль сотрудника':picker==='department'?'Отдел сотрудника':confirm==='approve'?'Подтвердить профиль?':'Отклонить профиль?'} onClose={()=>{setPicker(null);setConfirm(null);}}>
          {picker?(picker==='role'?roles:departments).map(item=>{const active=picker==='role'?draft.role.id===item.id:draft.departmentId===item.id;return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{selected:active}} onPress={()=>{if(picker==='role')setDraft(current=>({...current,role:roles.find(role=>role.id===item.id)!}));else setDraft(current=>({...current,departmentId:item.id,departmentName:item.name}));setPicker(null);}} style={[s.option,{backgroundColor:active?t.soft:'transparent'}]}><Text style={{flex:1,fontSize:16,color:t.text}}>{String('displayName' in item?item.displayName:item.name)}</Text>{active&&<Ionicons name="checkmark" size={21} color={t.accent}/>}</Pressable>;}):<>
            <Text style={{paddingHorizontal:20,paddingBottom:20,color:t.muted,fontSize:14,lineHeight:21}}>{nameOf(draft)} · {draft.departmentName}{'\n'}Роль: {draft.role.displayName}</Text>
            {confirm==='block'&&<TextInput accessibilityLabel="Причина отклонения" value={reason} onChangeText={setReason} placeholder="Причина отклонения" placeholderTextColor={t.muted} style={[s.reason,{backgroundColor:t.panel,color:t.text}]}/>}
            <Pressable accessibilityRole="button" onPress={moderate} style={[s.primary,{backgroundColor:confirm==='approve'?t.accent:t.danger}]}><Text style={s.primaryText}>{confirm==='approve'?'Подтвердить доступ':'Отклонить'}</Text></Pressable>
          </>}
      </DesignSheet>}
  </DesignEditor>;
}

const s=StyleSheet.create({
  userRow:{minHeight:94,paddingVertical:14,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:16},userName:{fontSize:16,lineHeight:22,fontWeight:'600'},chip:{minHeight:36,paddingHorizontal:13,paddingVertical:9,borderRadius:18,justifyContent:'center'},listSummary:{paddingHorizontal:20,paddingTop:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},empty:{padding:32,alignItems:'center',gap:14},
  modalRoot:{flex:1,justifyContent:'flex-end'},filterSheet:{borderTopLeftRadius:24,borderTopRightRadius:24,paddingTop:12,maxHeight:'85%'},sheetTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingLeft:20,paddingRight:8,marginBottom:12},iconButton:{width:48,height:48,alignItems:'center',justifyContent:'center'},label:{fontSize:11,letterSpacing:.6,paddingHorizontal:20,marginTop:12,marginBottom:12},chips:{flexDirection:'row',flexWrap:'wrap',paddingHorizontal:16,gap:6},primary:{marginHorizontal:20,marginTop:20,minHeight:48,borderRadius:24,alignItems:'center',justifyContent:'center'},primaryText:{fontSize:15,fontWeight:'600',color:'#FFFFFF'},toast:{position:'absolute',left:20,right:20,padding:16,borderRadius:20,flexDirection:'row',gap:10,alignItems:'center'},
  round:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},cardHeading:{height:48,flex:1,borderRadius:24,paddingHorizontal:16,justifyContent:'center'},identity:{alignItems:'center',paddingTop:14,paddingBottom:24,gap:9},cardName:{fontSize:22,lineHeight:28,fontWeight:'700',textAlign:'center',paddingTop:6},status:{borderRadius:14,paddingVertical:6,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:5},review:{borderRadius:18,padding:16,gap:12,marginBottom:8},reviewButton:{minHeight:44,borderRadius:22,flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},groupLabel:{fontSize:11,lineHeight:18,letterSpacing:.7,marginLeft:16,marginTop:18,marginBottom:8},group:{borderRadius:18,overflow:'hidden'},field:{paddingHorizontal:16,paddingTop:14,paddingBottom:10,gap:4},fieldInput:{fontSize:16,lineHeight:22,padding:0,minHeight:26,...Platform.select({web:{outlineStyle:'none'} as any})},choice:{minHeight:74,paddingHorizontal:16,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12},connection:{minHeight:54,flexDirection:'row',alignItems:'center',paddingHorizontal:16},option:{minHeight:54,paddingHorizontal:24,flexDirection:'row',alignItems:'center'},reason:{marginHorizontal:20,padding:16,borderRadius:16,fontSize:15,minHeight:50},
});
