import React,{useEffect,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpTheme} from '../../help/helpTheme';
import {DesignEmpty,DesignList,DesignRow} from './AdminDesignPrimitives';
import {useAdminData,type ReleaseCommit as Commit} from './AdminDataContext';

const contains=(value:string,query:string)=>value.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'));
const dateFormatter=new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Novosibirsk',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
function dateLabel(date:string){const parts=dateFormatter.formatToParts(new Date(date));const part=(key:string)=>parts.find(item=>item.type===key)?.value??'';return `${part('day')} ${part('month')} ${part('year')} · ${part('hour')}:${part('minute')}`;}
function toggle(set:React.Dispatch<React.SetStateAction<Set<string>>>,key:string){set(previous=>{const next=new Set(previous);if(next.has(key))next.delete(key);else next.add(key);return next;});}

export default function AdminUpdates({top,query,filter}:{top:number;query:string;filter:string}) {
  const t=useHelpTheme();
  const {releases}=useAdminData();
  const [expandedVersions,setExpandedVersions]=useState(new Set<string>()),[expandedNotes,setExpandedNotes]=useState(new Set<string>());
  const filtered=releases.filter(item=>filter==='all'||item.channel===filter).filter(item=>contains([item.version,...item.commits.map(commit=>commit.subject),...item.otaUpdates.flatMap(ota=>[ota.version,...ota.commits.map(commit=>commit.subject)])].join(' '),query));
  useEffect(()=>{
    if(!query.trim())return;
    setExpandedVersions(new Set(filtered.map(item=>item.id)));
    setExpandedNotes(new Set(filtered.flatMap(item=>[
      ...(item.commits.some(commit=>contains(commit.subject,query))?[`${item.id}:apk`]:[]),
      ...item.otaUpdates.filter(ota=>contains(ota.version,query)||ota.commits.some(commit=>contains(commit.subject,query))).map(ota=>`${item.id}:${ota.id}`),
    ])));
  },[query,filter]);
  return <DesignList top={top}>
    {filtered.map(item=>{const expanded=expandedVersions.has(item.id),apkKey=`${item.id}:apk`;return <View key={item.id}>
      <DesignRow expanded={expanded} title={`Версия ${item.version}`} subtitle={item.build?`${item.publishedAt?'Выпущено':'Собрано'} ${dateLabel(item.publishedAt??item.builtAt)}`:'OTA-обновления этой версии'} icon={item.platform==='ios'?'logo-apple':'logo-android'} onPress={()=>toggle(setExpandedVersions,item.id)} trailing={<Ionicons name={expanded?'chevron-up':'chevron-down'} size={21} color={t.muted}/>}/>
      {expanded&&<View style={s.expanded}>
        {item.otaUpdates.length>0&&<>
          <Text style={[s.sectionCaption,{color:t.muted}]}>OTA-ОБНОВЛЕНИЯ</Text>
          <View style={[s.group,{backgroundColor:t.incoming}]}>{item.otaUpdates.map(ota=>{const key=`${item.id}:${ota.id}`,open=expandedNotes.has(key);return <View key={ota.id}>
            <Pressable accessibilityRole="button" accessibilityLabel={`OTA ${ota.version}`} accessibilityState={{expanded:open}} onPress={()=>toggle(setExpandedNotes,key)} style={({pressed})=>[s.otaRow,{backgroundColor:pressed?t.soft:'transparent'}]}>
              <Ionicons name="refresh-outline" size={20} color={t.accent}/><View style={s.copy}><View style={{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'}}><Text style={[s.otaTitle,{color:t.text}]}>OTA {ota.version}</Text>{ota.previewOnly&&<Text style={[s.example,{backgroundColor:t.soft,color:t.muted}]}>Пример</Text>}</View><Text style={[s.date,{color:t.muted}]}>{ota.publishedAt?'Выпущено':'Изменения от'} {dateLabel(ota.publishedAt??ota.changesAt)}</Text></View><Ionicons name={open?'chevron-up':'chevron-down'} size={19} color={t.muted}/>
            </Pressable>
            {open&&<GitComments commits={ota.commits}/>}
          </View>;})}</View>
        </>}
        <View style={[s.group,{backgroundColor:t.incoming,marginTop:item.otaUpdates.length?12:0}]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Изменения APK ${item.version}`} accessibilityState={{expanded:expandedNotes.has(apkKey)}} onPress={()=>toggle(setExpandedNotes,apkKey)} style={({pressed})=>[s.otaRow,{backgroundColor:pressed?t.soft:'transparent'}]}><Ionicons name="git-branch-outline" size={20} color={t.accent}/><View style={s.copy}><Text style={[s.otaTitle,{color:t.text}]}>Изменения версии</Text><Text style={[s.date,{color:t.muted}]}>{item.commits.some(commit=>commit.sha)?'Комментарии Git':'Описание выпуска'} · {item.commits.length}</Text></View><Ionicons name={expandedNotes.has(apkKey)?'chevron-up':'chevron-down'} size={19} color={t.muted}/></Pressable>
          {expandedNotes.has(apkKey)&&<GitComments commits={item.commits}/>}
        </View>
      </View>}
    </View>;})}
    {!filtered.length&&<DesignEmpty title={query?'Обновления не найдены':'Версий пока нет'} description={query?'Можно искать по версии или тексту изменений':'Здесь появится история выпусков приложения'} icon="time-outline"/>}
  </DesignList>;
}

function GitComments({commits}:{commits:Commit[]}) {
  const t=useHelpTheme();return <View style={{paddingHorizontal:16,paddingBottom:16,gap:14}}>{commits.length?commits.map((commit,index)=><View key={commit.sha||`${index}:${commit.subject}`} style={{gap:4}}><Text selectable style={{fontSize:14,lineHeight:21,color:t.text}}>{commit.subject}</Text><Text selectable style={{fontSize:11,lineHeight:16,color:t.muted}}>{commit.sha?commit.sha.slice(0,7):''}</Text></View>):<Text style={{fontSize:14,lineHeight:21,color:t.muted}}>Описание выпуска не заполнено.</Text>}</View>;
}
const s=StyleSheet.create({expanded:{marginLeft:84,marginRight:18,paddingBottom:16},sectionCaption:{fontSize:11,lineHeight:18,letterSpacing:.6,marginBottom:8,marginLeft:2},group:{borderRadius:16,overflow:'hidden'},otaRow:{padding:14,minHeight:74,flexDirection:'row',alignItems:'center',gap:10},copy:{flex:1,minWidth:0,gap:5},otaTitle:{fontSize:14,lineHeight:20,fontWeight:'600'},date:{fontSize:12,lineHeight:18},example:{fontSize:10,lineHeight:16,paddingHorizontal:6,borderRadius:6}});
