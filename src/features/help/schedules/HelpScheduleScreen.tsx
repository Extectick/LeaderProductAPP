import React,{memo,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Keyboard,StyleSheet,Text,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {AuthContext} from '@/context/AuthContext';
import HelpScreen from '../HelpScreen';
import {useHelpTheme} from '../helpTheme';
import type {HelpMessage} from '../helpApi';
import {TasksPanel,ScheduleProposal} from './TasksPanel';
import {useServerSchedules} from './useServerSchedules';

const Chats=memo(HelpScreen);

function AccountSchedules({userId}:{userId:number}) {
  const router=useRouter();
  const params=useLocalSearchParams<{scheduleId?:string;runId?:string}>();
  const c=useHelpTheme();
  const schedules=useServerSchedules(userId);
  const latest=useRef(schedules);latest.current=schedules;
  const {state,loaded,storageError}=schedules;
  const [panel,setPanel]=useState<{id?:string;run?:string}|null>(null);
  const startNew=useRef<()=>void>(undefined);
  const startIfEmpty=useRef(false);
  const handled=useRef<string|undefined>(undefined);
  useEffect(()=>{
    if(!params.scheduleId){handled.current=undefined;return;}
    const key=params.scheduleId+':'+(params.runId || '');
    if(handled.current===key)return;
    handled.current=key;
    setPanel({id:params.scheduleId,run:params.runId});
    void latest.current.retry();
  },[params.scheduleId,params.runId]);
  const openTasks=useCallback((newChat:()=>void)=>{
    Keyboard.dismiss();startNew.current=newChat;
    const data=latest.current;
    if(data.loaded && !data.storageError && !data.state.tasks.length)newChat();
    else {startIfEmpty.current=!data.loaded;setPanel({});void data.retry();}
  },[]);
  useEffect(()=>{
    if(!loaded || !startIfEmpty.current)return;
    startIfEmpty.current=false;
    if(panel && !storageError && !state.tasks.length){setPanel(null);startNew.current?.();}
  },[panel,loaded,storageError,state.tasks.length]);
  function close() {
    startIfEmpty.current=false;setPanel(null);latest.current.closePanel();
    if(params.scheduleId)router.setParams({scheduleId:undefined,runId:undefined});
  }
  const renderAction=useCallback((message:HelpMessage)=>{
    const draft=message.assistantRun?.scheduleDraft;
    if(!draft || message.assistantRun?.status!=='completed')return null;
    const saved=state.tasks.find(task=>task.messageId===message.id);
    const decision=state.decisions?.[message.id];
    let status='';
    if(saved)status='Задание сохранено · ежедневно в '+saved.time+' · '+saved.timeZone;
    else if(decision==='deleted')status='Задание удалено.';
    else if(decision==='cancelled')status='Создание задания отменено.';
    else if(!loaded)status=storageError || 'Загружаем задание…';
    return <View style={{marginHorizontal:16,marginBottom:12}}>
      {status?<Text accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:14}}>{status}</Text>
        : <ScheduleProposal draft={draft} now={Date.now()} onConfirm={value=>latest.current.confirm(message.ticketId,message.id,value)}
            onCancel={()=>latest.current.cancel(message.ticketId,message.id)}/>}
    </View>;
  },[state.tasks,state.decisions,c.muted,loaded,storageError]);
  const integration=useMemo(()=>({onOpenTasks:openTasks,newChatRef:startNew,renderMessageAction:renderAction,
    activeTaskCount:state.activeTaskCount,unreadTaskCount:state.unreadTaskCount}),
    [openTasks,renderAction,state.activeTaskCount,state.unreadTaskCount]);
  return <View style={{flex:1,backgroundColor:c.background}}>
    <View style={{flex:1,display:panel?'none':'flex'}}><Chats schedules={integration}/></View>
    {panel && <View style={[StyleSheet.absoluteFill,{backgroundColor:c.background}]}>
      <TasksPanel key={(panel.id || '')+':'+(panel.run || '')} schedules={schedules} initialTaskId={panel.id} initialRunId={panel.run}
        onConnect={()=>router.push({pathname:'/profile/settings',params:{section:'onec'}})}
        onBack={close} onCreate={()=>{close();startNew.current?.();}}/>
    </View>}
  </View>;
}
export default function HelpScheduleScreen() {
  const auth=useContext(AuthContext);
  const id=Number(auth?.profile?.id || 0);
  return id && auth?.isAuthenticated ? <AccountSchedules key={id} userId={id}/> : <Chats/>;
}
