import React, {useCallback,useEffect,useRef,useState} from 'react';
import {BackHandler,Keyboard,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import Reanimated,{useSharedValue} from 'react-native-reanimated';
import {Ionicons, MaterialCommunityIcons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '@/context/ThemeContext';
import {useHelpTheme,useHelpReducedMotion} from '../../help/helpTheme';
import {ScreenBlurProvider,ScreenBlurTarget} from '@/components/ui/AppScreenBlur';
import {AppSceneTransition,useAppSceneUnderlayMotion,type AppSceneTransitionHandle} from '@/components/Navigation/AppSceneTransition';
import type {AdminTabKey} from '../types';
import AdminSection from './AdminSection';
import AdminUsers from './AdminUsers';
import {DesignOption,DesignSheet} from './AdminDesignPrimitives';
import {AdminSceneHeader,ADMIN_HEADER_HEIGHT} from './AdminSceneHeader';
import {useAdminData} from './AdminDataContext';
import {employeeCount} from './AdminOrganization';

const sections:{key:AdminTabKey;title:string;description:string;icon:string;family?:'ion'}[]=[
  {key:'users',title:'Пользователи',description:'Сотрудники компании',icon:'person-outline',family:'ion'},
  {key:'departments',title:'Отделы',description:'Отделы компании',icon:'domain'},
  {key:'roles',title:'Роли и права',description:'Доступ и наследование',icon:'shield-checkmark-outline',family:'ion'},
  {key:'services',title:'Сервисы',description:'Доступность для сотрудников',icon:'apps'},
  {key:'knowledge',title:'База знаний',description:'Документы компании',icon:'book-outline',family:'ion'},
  {key:'updates',title:'Обновления',description:'Версии приложения',icon:'sync-outline',family:'ion'},
];
type Sheet='menu'|'profile'|'exit'|null;
const searchLabels:Record<AdminTabKey,string>={users:'Поиск сотрудников',departments:'Поиск отделов',roles:'Поиск ролей',services:'Поиск сервисов',knowledge:'Поиск документов',updates:'Поиск обновлений'};
const createLabels:Partial<Record<AdminTabKey,string>>={departments:'Создать отдел',roles:'Создать роль',services:'Добавить сервис'};
const filterOptions:Partial<Record<AdminTabKey,{key:string;label:string}[]>>={
  services:[{key:'all',label:'Все сервисы'},{key:'active',label:'Включённые'},{key:'inactive',label:'Выключенные'}],
  knowledge:[{key:'all',label:'Все документы'},{key:'company',label:'Материалы компании'},{key:'draft',label:'Черновики ИИ'},{key:'archive',label:'Архив'}],
  updates:[{key:'all',label:'Все каналы'},{key:'dev',label:'Разработка'},{key:'prod',label:'Продакшн'}],
};

export default function AdminDirectory({onExit,onProfile,administratorName='Администратор'}:{onExit:()=>void;onProfile:()=>void;administratorName?:string}) {
  const {users,departments}=useAdminData();
  const t=useHelpTheme(),{setTheme}=useTheme(),insets=useSafeAreaInsets(),reducedMotion=useHelpReducedMotion();
  const [section,setSection]=useState<AdminTabKey|null>(null),[query,setQuery]=useState(''),[sheet,setSheet]=useState<Sheet>(null);
  const [directoryQuery,setDirectoryQuery]=useState(''),[sceneKey,setSceneKey]=useState(0);
  const scene=useRef<AppSceneTransitionHandle>(null),closing=useRef(false),progress=useSharedValue(0);
  const directoryMotion=useAppSceneUnderlayMotion(progress,section!==null);
  const [queuedUserId,setQueuedUserId]=useState<number|null>(null);
  const [userFiltersOpen,setUserFiltersOpen]=useState(false);
  const [createRequest,setCreateRequest]=useState(0),[sectionFilter,setSectionFilter]=useState('all');
  const pending=users.filter(user=>user.employeeStatus==='PENDING');
  const title=sections.find(item=>item.key===section)?.title;
  const headerHeight=insets.top+ADMIN_HEADER_HEIGHT;
  const closeSection=useCallback(async()=>{
    if(!section||closing.current)return;
    closing.current=true;Keyboard.dismiss();
    try {const finished=await scene.current?.dismiss();if(finished===false)return;setSection(null);setQueuedUserId(null);setQuery('');}
    finally {closing.current=false;}
  },[section]);
  useEffect(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(sheet){setSheet(null);return true;} if(section){void closeSection();return true;} onExit();return true;
  });return()=>sub.remove();},[section,sheet,closeSection,onExit]);
  const openSection=(key:AdminTabKey)=>{if(closing.current)return;Keyboard.dismiss();setQuery('');setCreateRequest(0);setSectionFilter('all');setSceneKey(value=>value+1);setSection(key);};
  const openPending=()=>{setQueuedUserId(pending[0]?.id??null);openSection('users');};
  const rowSurface=({pressed,hovered}:any)=>({backgroundColor:pressed?t.soft:hovered?t.panel:'transparent'});
  const visible=sections.filter(item=>(item.title+' '+item.description).toLocaleLowerCase('ru').includes(directoryQuery.trim().toLocaleLowerCase('ru')));

  return <View style={[s.root,{backgroundColor:t.background}]}>
    <Reanimated.View testID="admin-directory-scene" pointerEvents={section?'none':'auto'} aria-hidden={section!==null} accessibilityElementsHidden={section!==null} importantForAccessibility={section?'no-hide-descendants':'auto'} style={[StyleSheet.absoluteFill,directoryMotion]}>
      <AdminSceneFrame caption="Администрирование" placeholder="Разделы" searchLabel="Поиск разделов" query={directoryQuery} onQuery={setDirectoryQuery} onBack={onExit} menuLabel="Меню администрирования" onMenu={()=>setSheet('menu')}>
      <ScrollView testID="admin-directory" keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1,paddingTop:headerHeight+14,paddingBottom:insets.bottom+20}}>
        {pending.length>0&&!directoryQuery.trim()&&<Pressable testID="admin-pending" accessibilityRole="button" accessibilityLabel={`${employeeCount(pending.length)} на проверке. Подтвердить профиль`} onPress={openPending} style={({pressed,hovered}:any)=>[s.pending,{backgroundColor:pressed||hovered?t.outgoing:t.soft}]}>
          <View style={[s.pendingAvatar,{backgroundColor:t.accent}]}><Text style={s.initials}>{[pending[0]?.firstName[0],pending[0]?.lastName[0]].filter(Boolean).join('').toUpperCase()||'?'}</Text></View>
          <View style={s.copy}><Text style={[s.title,{color:t.text}]}>{employeeCount(pending.length)} на проверке</Text><Text style={[s.description,{color:t.muted}]}>Нужно подтвердить профиль</Text></View>
          <Ionicons name="chevron-forward" size={22} color={t.muted}/>
        </Pressable>}
        <View style={{marginTop:pending.length&&!directoryQuery.trim()?18:0}}>
          {visible.map(item=><Pressable key={item.key} testID={`admin-section-${item.key}`} accessibilityRole="button" accessibilityLabel={item.title} onPress={()=>openSection(item.key)} style={state=>[s.section,rowSurface(state)]}>
            <View style={[s.sectionIcon,{backgroundColor:t.soft}]}>{item.family==='ion'?<Ionicons name={item.icon as React.ComponentProps<typeof Ionicons>['name']} size={28} color={t.accent}/>:<MaterialCommunityIcons name={item.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']} size={28} color={t.accent}/>}</View>
            <View style={s.copy}><Text style={[s.title,{color:t.text}]}>{item.title}</Text><Text style={[s.description,{color:t.muted}]}>{item.key==='users'?employeeCount(users.length):item.key==='departments'?`${departments.length} ${departments.length%10===1&&departments.length%100!==11?'отдел':departments.length%10>=2&&departments.length%10<=4&&(departments.length%100<12||departments.length%100>14)?'отдела':'отделов'} компании`:item.description}</Text></View>
            <Ionicons name="chevron-forward" size={22} color={t.muted}/>
          </Pressable>)}
          {!visible.length&&<View style={s.empty}><Ionicons name="search-outline" size={32} color={t.muted}/><Text style={[s.title,{color:t.text}]}>Раздел не найден</Text><Text style={[s.description,{color:t.muted,textAlign:'center'}]}>Попробуйте другое название</Text></View>}
        </View>
        <View style={{flex:1,minHeight:44}}/>
        <Pressable accessibilityRole="button" accessibilityLabel="Профиль администратора" onPress={onProfile} style={state=>[s.profile,rowSurface(state)]}>
          <View style={[s.profileAvatar,{backgroundColor:t.accentText}]}><Text style={s.initials}>А</Text></View>
          <Text style={[s.profileLabel,{color:t.text}]}>{administratorName}</Text>
        </Pressable>
      </ScrollView>
      </AdminSceneFrame>
    </Reanimated.View>
    {section&&<View style={StyleSheet.absoluteFill}>
      <AppSceneTransition key={`${section}:${sceneKey}`} ref={scene} ready reducedMotion={reducedMotion} backgroundColor={t.background} progress={progress} sceneTestID="admin-section-viewport">
        <AdminSceneFrame caption={section==='users'?'Администрирование':title??''} placeholder={searchLabels[section]} searchLabel={searchLabels[section]} query={query} onQuery={setQuery} onBack={()=>void closeSection()} menuLabel={section==='users'?'Фильтры пользователей':'Меню раздела'} menuIcon={section==='users'?'options-outline':'ellipsis-horizontal'} onMenu={()=>section==='users'?setUserFiltersOpen(true):setSheet('menu')}>
          <View style={{flex:1,paddingBottom:insets.bottom}}>
            {section==='users'?<AdminUsers contentTop={headerHeight} query={query} filtersOpen={userFiltersOpen} onCloseFilters={()=>setUserFiltersOpen(false)} queuedUserId={queuedUserId} onConsumeUser={()=>setQueuedUserId(null)}/>:<AdminSection key={section} section={section} contentTop={headerHeight} query={query} createRequest={createRequest} filter={sectionFilter} onOpenUser={id=>{setQueuedUserId(id);openSection('users');}}/>}
          </View>
        </AdminSceneFrame>
      </AppSceneTransition>
    </View>}
    {sheet!==null&&<DesignSheet title={sheet==='menu'?(title??'Администрирование'):sheet==='profile'?'Профиль':'Главное меню'} onClose={()=>setSheet(null)}>
          {sheet==='menu'?<>
            {section&&createLabels[section]&&<Pressable accessibilityRole="button" accessibilityLabel={createLabels[section]} onPress={()=>{setQuery('');setSheet(null);setCreateRequest(value=>value+1);}} style={state=>[s.menuRow,rowSurface(state)]}><Ionicons name="add-outline" size={24} color={t.accent}/><Text style={[s.menuText,{color:t.accentText}]}>{createLabels[section]}</Text></Pressable>}
            {section&&filterOptions[section]?.map(option=><DesignOption key={option.key} title={option.label} selected={sectionFilter===option.key} onPress={()=>{setSectionFilter(option.key);setSheet(null);}}/>)}
            <Pressable accessibilityRole="button" accessibilityLabel="Переключить тему" onPress={()=>void setTheme(t.dark?'light':'dark')} style={state=>[s.menuRow,rowSurface(state)]}><Ionicons name={t.dark?'sunny-outline':'moon-outline'} size={23} color={t.accent}/><Text style={[s.menuText,{color:t.text}]}>{t.dark?'Светлая тема':'Тёмная тема'}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={()=>{setSheet(null);void closeSection();}} style={state=>[s.menuRow,rowSurface(state)]}><Ionicons name="grid-outline" size={23} color={t.accent}/><Text style={[s.menuText,{color:t.text}]}>Все разделы</Text></Pressable>
          </>:sheet==='profile'?<View style={s.profileDetail}><View style={[s.sectionIcon,{backgroundColor:t.soft}]}><Ionicons name="person-outline" size={28} color={t.accent}/></View><Text style={[s.title,{color:t.text}]}>{administratorName}</Text><Text style={[s.description,{color:t.muted}]}>Полный доступ к разделам</Text></View>:<>
            <Text style={[s.description,{color:t.muted,paddingHorizontal:20,paddingBottom:16}]}>Открыт отдельный стенд администрирования.</Text>
            <Pressable accessibilityRole="button" onPress={()=>setSheet(null)} style={[s.returnButton,{backgroundColor:t.accent}]}><Text style={{color:'#FFFFFF',fontSize:16,fontWeight:'600'}}>Вернуться к разделам</Text></Pressable>
          </>}
    </DesignSheet>}
  </View>;
}

type FrameProps={caption:string;placeholder:string;searchLabel:string;query:string;onQuery:(value:string)=>void;onBack:()=>void;menuLabel:string;menuIcon?:React.ComponentProps<typeof Ionicons>['name'];onMenu:()=>void;children:React.ReactNode};
function AdminSceneFrame(props:FrameProps){return <ScreenBlurProvider><AdminSceneSurface {...props}/></ScreenBlurProvider>;}
function AdminSceneSurface({caption,placeholder,searchLabel,query,onQuery,onBack,menuLabel,menuIcon='ellipsis-horizontal',onMenu,children}:FrameProps){
  const t=useHelpTheme();
  const action=(icon:React.ComponentProps<typeof Ionicons>['name'],label:string,onPress:()=>void)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed,hovered}:any)=>[s.round,{backgroundColor:pressed||hovered?t.soft:t.panel}]}><Ionicons name={icon} size={24} color={t.text}/></Pressable>;
  return <View style={[s.root,{backgroundColor:t.background}]}><ScreenBlurTarget style={s.root}>{children}</ScreenBlurTarget>
    <AdminSceneHeader caption={caption}>
      {action('chevron-back','Назад',onBack)}<View style={[s.search,{backgroundColor:t.panel}]}><Ionicons name="search-outline" size={22} color={t.muted}/><TextInput accessibilityLabel={searchLabel} placeholder={placeholder} placeholderTextColor={t.muted} value={query} onChangeText={onQuery} style={[s.input,{color:t.text}]} returnKeyType="search"/>{!!query&&<Pressable accessibilityRole="button" accessibilityLabel="Очистить поиск" onPress={()=>onQuery('')} hitSlop={8}><Ionicons name="close" size={20} color={t.muted}/></Pressable>}</View>{action(menuIcon,menuLabel,onMenu)}
    </AdminSceneHeader>
  </View>;
}

const s=StyleSheet.create({
  root:{flex:1,overflow:'hidden'},
  round:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},
  search:{flex:1,height:48,borderRadius:24,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:10,minWidth:0},
  input:{flex:1,minWidth:0,fontSize:16,lineHeight:22,padding:0,...Platform.select({web:{outlineStyle:'none'} as any})}, sectionHeading:{fontSize:16,fontWeight:'600',flex:1},
  pending:{marginHorizontal:12,borderRadius:12,minHeight:72,paddingVertical:13,paddingLeft:18,paddingRight:14,flexDirection:'row',alignItems:'center',gap:16},
  pendingAvatar:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'},initials:{fontSize:16,fontWeight:'600',color:'#FFFFFF'},
  copy:{flex:1,minWidth:0,gap:3},title:{fontSize:17,lineHeight:22,fontWeight:'700'},description:{fontSize:14,lineHeight:20},
  section:{minHeight:78,flexDirection:'row',alignItems:'center',paddingLeft:18,paddingRight:29,gap:16},sectionIcon:{width:50,height:50,borderRadius:25,alignItems:'center',justifyContent:'center'},
  profile:{minHeight:40,flexDirection:'row',alignItems:'center',paddingHorizontal:16,gap:12},profileAvatar:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},profileLabel:{fontSize:16,lineHeight:22,fontWeight:'600'},
  empty:{alignItems:'center',padding:32,gap:12},modalRoot:{flex:1,justifyContent:'flex-end'},sheet:{borderTopLeftRadius:24,borderTopRightRadius:24,paddingTop:12,maxHeight:'85%'},sheetHeading:{paddingHorizontal:20,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingBottom:8},menuRow:{minHeight:56,paddingHorizontal:24,flexDirection:'row',alignItems:'center',gap:16},menuText:{fontSize:16},profileDetail:{alignItems:'center',padding:20,gap:12},returnButton:{marginHorizontal:20,padding:16,borderRadius:24,alignItems:'center'},
});
