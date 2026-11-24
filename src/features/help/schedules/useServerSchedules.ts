import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {uuid} from 'expo';
import {useIsFocused} from 'expo-router/react-navigation';
import {scheduleApi,type ScheduleList,type ServerTask} from './api';
import type {Draft,Report,Run} from './model';

const empty:ScheduleList={tasks:[],activeTaskCount:0,unreadTaskCount:0,decisions:{}};
const errorMessage = (error:unknown) => error instanceof Error?error.message:'Не удалось загрузить задания.';
function mergeRuns<T extends Run>(incoming:T[],previous:T[]):T[] {
  const ids=new Set(incoming.map(item=>item.id));
  return [...incoming,...previous.filter(item=>!ids.has(item.id))].sort((a,b)=>b.at-a.at);
}

// The route mounts a separate instance per signed-in account. Every HTTP request
// also captures that account so a token refresh cannot redirect a pending mutation.
export function useServerSchedules(userId:number) {
  const api=useMemo(()=>scheduleApi(userId),[userId]);
  const focused=useIsFocused();
  const [state,setState]=useState<ScheduleList>(empty);
  const [loaded,setLoaded]=useState(false);
  const [storageError,setError]=useState('');
  const [reports,setReports]=useState<Report[]>([]);
  const [hasMoreReports,setHasMoreReports]=useState(false);
  const [now,setNow]=useState(Date.now);
  const stateRef=useRef(state);stateRef.current=state;
  const alive=useRef(true),listRevision=useRef(0),reportRevision=useRef(0);
  const historyPages=useRef(new Map<string,number>());
  const reportPages=useRef(0);
  const paused=useRef(false);
  const readPending=useRef(new Set<string>());
  const manual=useRef(new Map<string,string>());
  const load=useCallback(async()=>{
    if (!userId) return;
    const rev=++listRevision.current;
    try {
      const list=await api.list();
      const tasks=await Promise.all(list.tasks.map(async task=>{
        let runs=task.runs,hasMore=task.hasMoreRuns;
        const pages=historyPages.current.get(task.id) ?? 0;
        for(let i=0;i<pages && hasMore && runs.length;i++){
          const page=await api.runs(task.id,runs[runs.length-1].id);
          runs=mergeRuns(page.runs,runs);hasMore=page.hasMore && page.runs.length>0;
        }
        return {...task,runs,hasMoreRuns:hasMore};
      }));
      if(!alive.current || listRevision.current!==rev)return;
      setState({...list,tasks});setLoaded(true);setError('');setNow(Date.now());
    } catch(error) {
      if(alive.current && rev===listRevision.current) {
        setError(errorMessage(error));setState(empty);setLoaded(false);setReports([]);
      }
    }
  },[api,userId]);
  const fetchReports=useCallback(async(more:boolean)=>{
    const rev=++reportRevision.current;
    const pages=more ? reportPages.current+1 : Math.max(1,reportPages.current);
    let runs:Report[]=[],hasMore=false;
    for(let i=0;i<pages;i++){
      const page=await api.reports(runs.at(-1)?.id);
      if(!alive.current || rev!==reportRevision.current)return;
      runs=mergeRuns(page.runs,runs);hasMore=page.hasMore && page.runs.length>0;
      if(!hasMore)break;
    }
    reportPages.current=pages;
    setReports(runs);setHasMoreReports(hasMore);
  },[api]);
  const refresh=useCallback(async()=>{
    await load();
    if(reportPages.current)await fetchReports(false).catch(error=>{if(alive.current){setReports([]);setError(errorMessage(error));}});
  },[load,fetchReports]);
  useEffect(()=>{
    alive.current=true;
    return ()=>{alive.current=false;listRevision.current++;reportRevision.current++;};
  },[]);
  useEffect(()=>{
    if(!focused || !userId)return;
    let busy=false,active=true;
    function poll() {
      if(!active || busy || paused.current || AppState.currentState==='background' || AppState.currentState==='inactive') return;
      busy=true;void refresh().finally(()=>{busy=false;});
    }
    poll();
    const interval=setInterval(poll,15000);
    const listener=AppState.addEventListener('change',state=>{if(state==='active')poll();});
    return ()=>{active=false;clearInterval(interval);listener.remove();};
  },[focused,userId,refresh]);

  function applyTask(item:ServerTask) {
    setState(current=>{
      const prior=current.tasks.find(task=>task.id===item.id);
      const tasks=prior?current.tasks.map(task=>task.id===item.id?{...item,runs:mergeRuns(item.runs,task.runs)}:task):[item,...current.tasks];
      return {...current,tasks,activeTaskCount:tasks.filter(task=>task.active).length};
    });
  }
  async function mutate<T>(work:()=>Promise<T>,apply?:(value:T)=>void) {
    paused.current=true;
    ++listRevision.current;
    try {const result=await work();if(alive.current){apply?.(result);await refresh();}}
    finally {paused.current=false;}
  }
  const loadMoreRuns=useCallback(async(id:string)=>{
    const task=stateRef.current.tasks.find(item=>item.id===id);
    if(!task?.hasMoreRuns || !task.runs.length)return;
    const page=await api.runs(id,task.runs[task.runs.length-1].id);
    if(!alive.current)return;
    ++listRevision.current;
    historyPages.current.set(id,(historyPages.current.get(id) ?? 0)+1);
    setState(current=>({...current,tasks:current.tasks.map(item=>item.id===id?{...item,runs:mergeRuns(item.runs,page.runs),hasMoreRuns:page.hasMore}:item)}));
  },[api]);
  const readReports=useCallback((ids:string[])=>{
    const fresh=ids.filter(id=>!readPending.current.has(id));
    if(!fresh.length)return;
    fresh.forEach(id=>readPending.current.add(id));
    void api.read(fresh).then(async()=>{
      if(!alive.current)return;
      const changed=new Set(fresh);
      const mark=<T extends Run>(rows:T[])=>rows.map(run=>changed.has(run.id)?{...run,unread:false}:run);
      ++reportRevision.current;
      setReports(mark);setState(current=>({...current,tasks:current.tasks.map(task=>({...task,runs:mark(task.runs)}))}));
      await load();
    }).catch(error=>{if(alive.current)setError(errorMessage(error));}).finally(()=>fresh.forEach(id=>readPending.current.delete(id)));
  },[api,load]);
  return {state,loaded,storageError,now,reports,hasMoreReports,fetchReports,readReports,loadMoreRuns,retry:refresh,
    closePanel:()=>{reportRevision.current++;reportPages.current=0;historyPages.current.clear();setReports([]);setHasMoreReports(false);},
    confirm:(ticket:number,message:number,draft:Draft)=>mutate(()=>api.add(ticket,message,draft),applyTask),
    cancel:(ticket:number,message:number)=>mutate(()=>api.cancel(ticket,message),()=>setState(current=>({...current,decisions:{...current.decisions,[message]:'cancelled'}}))),
    save:(draft:Draft,id:string)=>mutate(()=>api.update(id,draft),applyTask),
    toggle:(id:string)=>{const task=stateRef.current.tasks.find(item=>item.id===id);return task?mutate(()=>api.update(id,{active:!task.active}),applyTask):Promise.resolve();},
    remove:(id:string)=>mutate(()=>api.remove(id),()=>{
      historyPages.current.delete(id);setReports(items=>items.filter(run=>run.taskId!==id));
      setState(current=>({...current,tasks:current.tasks.filter(task=>task.id!==id)}));
    }),
    check:(id:string)=>mutate(async()=>{
      const requestId=manual.current.get(id) || uuid.v4();
      manual.current.set(id,requestId);await api.check(id,requestId);manual.current.delete(id);
    }),
  };
}
