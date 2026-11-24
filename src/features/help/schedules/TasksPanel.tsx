import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {ActivityIndicator, BackHandler, ScrollView, KeyboardAvoidingView, Platform, Pressable, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {HelpHeaderFrame} from '../components/HelpHeaderFrame';
import {HelpPrimaryButton} from '../components/HelpPrimitives';
import {Button, useTaskStyles} from './controls';
import {dateText, ScheduleEditor} from './ScheduleEditor';
import {metricLabels, warehouseLabel, type Draft, type Run, type SavedTask, type Report} from './model';
export type PanelSchedules = {
  state:{tasks:SavedTask[]}; loaded:boolean; now:number; storageError:string;
  readReports:(ids:string[])=>void; save:(draft:Draft,id:string)=>void | Promise<void>;
  toggle:(id:string)=>void | Promise<void>; check:(id:string)=>void | Promise<void>;
  remove:(id:string)=>void | Promise<void>; retry?:()=>void; loadMoreRuns?:(id:string)=>Promise<void>;
  reports?:Report[]; hasMoreReports?:boolean; fetchReports?:(more:boolean)=>Promise<void>;
};
type Section = 'tasks' | 'reports';
const results = {alert:'Найдены отрицательные остатки',clear:'Отрицательных остатков нет',error:'Не удалось выполнить проверку'};

export function ScheduleProposal({draft, now, onConfirm, onCancel}: {
  draft:Draft; now:number; onConfirm:(draft:Draft)=>void; onCancel:()=>void;
}) {
  return <ScheduleEditor initial={draft} editing={false} now={now} onSave={onConfirm} onClose={onCancel}/>;
}

function Result({run, task}:{run:Run; task:SavedTask}) {
  const {c,s}=useTaskStyles();
  return <View style={[s.column,s.divider]}>
    <View style={{gap:4}}>
      <Text style={s.caption}>{dateText(run.at,task.timeZone)} · {run.slot===null?'Вручную':'По расписанию'}</Text>
      <Text style={[s.label,run.status==='error' && {color:c.danger}]}>{run.error || results[run.status]}</Text>
    </View>
    {run.truncated && <Text style={s.caption}>Показаны первые 100 позиций.</Text>}
    {run.rows.map(row=><View key={row.warehouse + row.product} style={{flexDirection:'row',alignItems:'center',gap:12}}>
      <View style={{flex:1}}><Text style={s.body}>{row.product}</Text><Text style={s.caption}>{row.warehouse}</Text></View>
      <Text style={[s.label,{color:c.danger}]}>{row.quantity} шт.</Text>
    </View>)}
  </View>;
}

function TaskRow({task,onPress,warehouses}:{task:SavedTask;onPress:()=>void;warehouses?:Record<string,string>}) {
  const {c,s}=useTaskStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={'Открыть задание на '+task.time} onPress={onPress}
    style={({pressed})=>[s.taskRow,{backgroundColor:pressed?c.soft:'transparent'}]}>
    <View style={s.avatar}><Ionicons name={task.active?'time-outline':'pause-outline'} size={23} color={task.active?c.accentText:c.muted}/></View>
    <View style={{flex:1,gap:3}}>
      <Text style={s.title}>Отрицательные остатки</Text>
      <Text style={s.caption}>{task.active?'Ежедневно':'На паузе'} · {task.time} · {warehouses?.[task.warehouse] ?? warehouseLabel(task.warehouse)}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={c.muted}/>
  </Pressable>;
}

export function TasksPanel({schedules, onBack, onCreate, initialTaskId, initialRunId, tools, warehouses, onConnect}:{
  schedules:PanelSchedules; onBack:()=>void; onCreate:()=>void; initialTaskId?:string; initialRunId?:string; warehouses?:Record<string,string>; onConnect?:()=>void;
  tools?:{button:React.ReactNode;panel:React.ReactNode};
}) {
  const {state, loaded, now, storageError, readReports, save, toggle, check, remove}=schedules;
  const {c,s}=useTaskStyles();
  const [section,setSection]=useState<Section>('tasks');
  const [id,setId]=useState(initialTaskId);
  const [editing,setEditing]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [feedback,setFeedback]=useState('');
  const [pending,setPending]=useState(false);
  const operation = useRef(false);
  async function perform(action:()=>Promise<void>|void, success='') {
    if (operation.current) return;
    operation.current=true;setPending(true);setFeedback('');
    try { await action();setFeedback(success); }
    catch (error) { setFeedback(error instanceof Error?error.message:'Не удалось выполнить действие.'); }
    finally {operation.current=false;setPending(false);}
  }
  const [limit,setLimit]=useState(10);
  const task=state.tasks.find(item=>item.id===id);
  const reports=schedules.reports ? schedules.reports.flatMap(run=>{
    const owner=state.tasks.find(item=>item.id===run.taskId);
    return owner?[{task:owner,run}]:[];
  }) : state.tasks.flatMap(task=>task.runs.filter(run=>run.status==='alert').map(run=>({task,run})))
    .sort((a,b)=>b.run.at-a.run.at);
  const viewingReports=loaded && !task && section==='reports';
  const viewport=useRef({top:0,height:0});
  const unreadBounds=useRef(new Map<string,{y:number;height:number}>());
  useLayoutEffect(()=>{
    viewport.current={top:0,height:0};
    unreadBounds.current.clear();
  },[id,section,editing]);
  function readVisibleReports() {
    if (!viewingReports) return;
    const {top,height}=viewport.current;
    if (!height) return;
    const seen:string[]=[];
    for (const [reportId,bounds] of unreadBounds.current) {
      const visible=Math.min(top+height,bounds.y+bounds.height)-Math.max(top,bounds.y);
      if (bounds.height>0 && visible>=Math.min(height,bounds.height)/2) {
        seen.push(reportId);
        unreadBounds.current.delete(reportId);
      }
    }
    readReports(seen);
  }
  useEffect(()=>{
    if (loaded && task && !editing) readReports(task.runs.slice(0,limit).filter(run=>run.unread).map(run=>run.id));
  },[loaded,task,editing,limit,readReports]);
  const back=useCallback(()=>{
    if (confirmDelete) setConfirmDelete(false);
    else if (editing) setEditing(false);
    else if (task) { setId(undefined); setLimit(10); }
    else onBack();
  },[confirmDelete,editing,task,onBack]);
  useEffect(()=>{
    if (Platform.OS!=='android') return;
    const listener=BackHandler.addEventListener('hardwareBackPress',()=>{back();return true;});
    return ()=>listener.remove();
  },[back]);
  function openTask(next:string) {
    setId(next); setEditing(false); setConfirmDelete(false); setLimit(10);
  }
  function showSection(next:Section) {
    setSection(next); setLimit(10);
    if (next==='reports' && schedules.fetchReports) void perform(()=>schedules.fetchReports!(false));
  }
  const targetRun=initialRunId && task && task.id===initialTaskId ? task.runs.find(run=>run.id===initialRunId) : undefined;
  useEffect(()=>{
    if (!initialRunId || task?.id!==initialTaskId || !task) return;
    const target=task.runs.findIndex(run=>run.id===initialRunId);
    if (target>=0) setLimit(count=>Math.max(count,target+1));
    else if (task.hasMoreRuns && schedules.loadMoreRuns && !feedback) void perform(()=>schedules.loadMoreRuns!(task.id));
  },[initialRunId,initialTaskId,task,schedules.loadMoreRuns,feedback,pending]);
  const title=task?'Регламентное задание':'Мои задания';
  return <SafeAreaView style={s.page}>
    <View style={s.header}><View style={{width:'100%',maxWidth:800,alignSelf:'center'}}>
      <HelpHeaderFrame title={title} contentSurface="plain" onBack={back}
        backLabel={task?'К заданиям':'К чатам'} trailing={tools?.button}/>
    </View></View>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView key={String(id)+section+editing} keyboardShouldPersistTaps="handled"
        onLayout={event=>{viewport.current.height=event.nativeEvent.layout.height;readVisibleReports();}}
        onScroll={viewingReports ? event=>{viewport.current.top=event.nativeEvent.contentOffset.y;readVisibleReports();} : undefined}
        scrollEventThrottle={32} contentContainerStyle={{alignItems:'center'}}>
        <View style={{width:'100%',maxWidth:772,gap:12,padding:16}}>
          {tools?.panel}
          {Boolean(storageError) && <Text accessibilityRole="alert" style={[s.caption,{color:c.danger}]}>{storageError}</Text>}
          {storageError && schedules.retry ? <Button label="Повторить" onPress={schedules.retry}/> : null}
          {feedback ? <Text accessibilityLiveRegion="polite" style={s.label}>{feedback}</Text> : null}
          {loaded && id && !task ? <Text style={s.caption}>Задание больше недоступно.</Text> : null}
          {!loaded && !storageError && <ActivityIndicator accessibilityLabel="Открываем задания" color={c.accentText}/>}
          {loaded && !task && <>
            <View accessibilityRole="tablist" style={{flexDirection:'row',backgroundColor:c.panel,padding:3,borderRadius:16}}>
              {(['tasks','reports'] as const).map(key=><Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:section===key}}
                onPress={()=>showSection(key)} style={{flex:1,minHeight:40,alignItems:'center',justifyContent:'center',backgroundColor:section===key?c.incoming:'transparent',borderRadius:13}}>
                <Text style={[s.label,{color:section===key?c.text:c.muted}]}>{key==='tasks'?'Задания':'Отчёты'+(reports.length?' · '+reports.length:'')}</Text>
              </Pressable>)}
            </View>
            {section==='tasks' ? <>
              {state.tasks.length ? <View style={[s.card,{padding:0,gap:0,overflow:'hidden'}]}>{state.tasks.map(item=>
                <TaskRow warehouses={warehouses} key={item.id} task={item} onPress={()=>openTask(item.id)}/>)}</View> :
                <View style={[s.card,{alignItems:'center',paddingVertical:30}]}><Ionicons name="calendar-outline" color={c.accentText} size={30}/>
                  <Text style={s.title}>Пока нет заданий</Text>
                  <Text style={[s.caption,{textAlign:'center'}]}>Напишите в чате, что ассистент должен проверять и в какое время.</Text>
                </View>}
              <HelpPrimaryButton text="Создать задание" onPress={onCreate}/>
            </> : <>
              {!pending && !reports.length && <View style={s.card}><Text style={s.title}>Отчётов пока нет</Text>
                <Text style={s.caption}>Здесь появятся позиции с отрицательными остатками.</Text></View>}
              {reports.slice(0,limit).map(({task:item,run})=><View key={run.id} style={s.card}
                onLayout={run.unread ? event=>{
                  const {y,height}=event.nativeEvent.layout;
                  unreadBounds.current.set(run.id,{y,height});
                  readVisibleReports();
                } : undefined}>
                <Text style={s.title}>Отрицательные остатки</Text><Result run={run} task={item}/>
                <Button label="Открыть задание" onPress={()=>openTask(item.id)}/>
              </View>)}
              {(reports.length>limit || schedules.hasMoreReports) && <Button label="Показать ещё" disabled={pending} onPress={()=>void perform(async()=>{
                if(reports.length<=limit) await schedules.fetchReports?.(true);
                setLimit(value=>value+10);
              })}/>}
            </>}
          </>}
          {loaded && task && (editing ? <ScheduleEditor warehouses={warehouses} initial={task} editing now={now} onClose={()=>setEditing(false)}
            onSave={async draft=>{await save(draft,task.id);setEditing(false);}}/> : <>
            {targetRun && <View style={s.card}><Text style={s.title}>Отчёт по уведомлению</Text><Result run={targetRun} task={task}/></View>}
            <View style={s.card}>
              <Text style={[s.caption,{color:task.active?c.green:c.muted}]}>{task.active?'Активно':'На паузе'}</Text>
              <Text style={s.title}>Отрицательные остатки</Text>
              <Text style={s.body}>Ежедневно в {task.time} · {task.timeZone}</Text>
              <Text style={s.caption}>{warehouses?.[task.warehouse] ?? warehouseLabel(task.warehouse)} · {metricLabels[task.metric]}</Text>
              {task.active && <Text style={s.label}>Следующая проверка · {dateText(task.due,task.timeZone)}</Text>}
              <Button kind="primary" label="Проверить сейчас" icon="play-outline" disabled={pending} onPress={()=>void perform(()=>check(task.id),tools?'':'Проверка поставлена в очередь. Результат появится в истории.')}/>
              <View style={s.row}><Button label={task.active?'Приостановить':'Возобновить'} disabled={pending} onPress={()=>void perform(()=>toggle(task.id))}/>
                <Button label="Изменить" onPress={()=>{setConfirmDelete(false);setEditing(true);}}/></View>
            </View>
            <View style={s.card}><Text style={s.title}>История проверок</Text>
              {!task.runs.length && <Text style={s.caption}>Проверок ещё не было.</Text>}
              {task.runs.slice(0,limit).map(run=><Result key={run.id} run={run} task={task}/>)}
              {onConnect && task.runs[0]?.errorCode==='ONEC_AUTH_REQUIRED' && <Button label="Подключение к 1С" onPress={onConnect}/>}
              {(task.runs.length>limit || task.hasMoreRuns) && <Button label="Показать ещё" disabled={pending} onPress={()=>void perform(async()=>{
                if(task.runs.length<=limit) await schedules.loadMoreRuns?.(task.id);
                setLimit(value=>value+10);
              })}/>}
            </View>
            {confirmDelete ? <View style={s.card}><Text style={s.title}>Удалить задание?</Text>
              <Text style={s.caption}>История проверок и отчёты этого задания также будут удалены.</Text>
              <View style={s.row}><Button kind="danger" label="Да, удалить" disabled={pending} onPress={()=>void perform(async()=>{await remove(task.id);setId(undefined);setConfirmDelete(false);})}/>
                <Button label="Отмена" onPress={()=>setConfirmDelete(false)}/></View></View> :
              <Button kind="danger" label="Удалить задание" onPress={()=>setConfirmDelete(true)}/>}
          </>)}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
