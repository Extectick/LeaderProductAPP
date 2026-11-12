import React,{useState} from 'react';
import {ScrollView,View,Text,Pressable} from 'react-native';
import {PaperProvider} from 'react-native-paper';
import {AuthContext,API_BASE_URL,setViewer} from './fixture';
import {UserAvatar,resolveProfileAvatar} from '../../components/Profile/UserAvatar';
import {ServicesHomeHeader} from '../../src/features/services/ui/ServicesHomeHeader';
import {ProfileHome} from '../../src/features/profile/ui/ProfileHome';
import {avatarAsset,clearAvatarMemory} from '../../src/shared/avatar/avatarSource';
import {removeAvatarFile} from '../../src/shared/avatar/avatarStorage';
import type {Profile} from '../../src/entities/user/types';
const uri=(version:string)=>`/users/11/avatars/EMPLOYEE/${version.repeat(64)}`;
async function control(offline=false,delay=0){await fetch(`${API_BASE_URL}/control?offline=${Number(offline)}&delay=${delay}`,{method:'POST'});}
export default function AvatarPreview(){
 const [surface,setSurface]=useState<'home'|'profile'>('home'),[version,setVersion]=useState<string|null>('a'),[viewer,setViewerId]=useState(1),[mount,setMount]=useState(0),[stats,setStats]=useState(''),[offline,setOffline]=useState(false);
 const profile={id:11,firstName:'Анна',lastName:'Проверка',middleName:null,email:'fixture@example.test',phone:null,avatarUrl:null,avatarAssetUrl:version?uri(version):null,avatarVersion:version?.repeat(64)||null,profileStatus:'ACTIVE',currentProfileType:'EMPLOYEE',role:{id:2,name:'employee'},departmentRoles:[],employeeProfile:{id:11,status:'ACTIVE',departmentRoles:[],department:{id:1,name:'QA'},activeDepartment:null,createdAt:new Date('2026-01-01T00:00:00Z'),updatedAt:new Date('2026-01-01T00:00:00Z')}} as Profile;
 const readStats=async()=>setStats(JSON.stringify(await(await fetch(`${API_BASE_URL}/stats`)).json()));
 const button=(label:string,action:()=>void)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={action} style={{paddingHorizontal:12,paddingVertical:10,borderRadius:8,backgroundColor:'#E2E8F0'}}><Text>{label}</Text></Pressable>;
 return <PaperProvider><AuthContext.Provider value={{isAuthenticated:true,profile:{id:viewer}}}><ScrollView style={{flex:1,backgroundColor:'#F7F9FC'}} contentContainerStyle={{padding:16,gap:16}}>
  <Text accessibilityRole="header" style={{fontSize:20,fontWeight:'700'}}>Avatar QA — синтетические фотографии</Text>
  <Text>Изолированный стенд. Экран: {surface}; версия: {version||'нет'}; смотрящий: {viewer}; сеть: {offline?'выключена':'включена'}</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
   {button('Главная',()=>setSurface('home'))}{button('Профиль QA',()=>setSurface('profile'))}{button('Открыть заново',()=>setMount(n=>n+1))}
   {button('Новая фотография v2',()=>{void control(false,1500).then(()=>{setOffline(false);setVersion('b');});})}
   {button('Фотография v1',()=>{void control(false,0).then(()=>{setOffline(false);setVersion('a');});})}
   {button('Удалить фото',()=>setVersion(null))}{button('Нет файла',()=>setVersion('d'))}
   {button('Сеть выключена',()=>{void control(true).then(()=>setOffline(true));})}{button('Сеть включена',()=>{void control(false).then(()=>setOffline(false));})}
   {button('Сменить аккаунт',()=>{const next=viewer===1?2:1;setViewer(next);setViewerId(next);})}
   {button('Обновить счётчики',()=>{void readStats();})}
   {button('Сбросить кэш QA',()=>{void(async()=>{clearAvatarMemory();for(const account of[1,2])for(const rev of['a','b','c']){const asset=avatarAsset(uri(rev),account);if(asset)await removeAvatarFile(asset.key);}await control(false);setOffline(false);setVersion('a');setMount(n=>n+1);await readStats();})();})}
  </View>
  <Text testID="fixture-counters" selectable>{stats||'Счётчики доступны по кнопке'}</Text>
  <View key={`${surface}:${mount}`} testID="fixture-surface" style={{backgroundColor:'#FFFFFF',borderRadius:20,paddingVertical:16,alignSelf:'center',width:'100%',maxWidth:760}}>
   {surface==='home'?<><ServicesHomeHeader onProfile={()=>setSurface('profile')} avatar={<UserAvatar identityKey={profile.id} uri={resolveProfileAvatar(profile)} initials="АП"/>}/><View style={{padding:24,gap:12}}><Text style={{fontSize:24,fontWeight:'600'}}>Главная страница</Text><Text>Та же фотография профиля, кеш и обработчик загрузки, что и в приложении.</Text></View></>:<ProfileHome profile={profile} version="QA" trackingEnabled={false} trackingBusy={false} trackingText="Выключена" trackingColor="#64748B" onToggleTracking={()=>{}} onOpen={()=>{}} onLogout={()=>{}}/>}
  </View>
 </ScrollView></AuthContext.Provider></PaperProvider>;
}
