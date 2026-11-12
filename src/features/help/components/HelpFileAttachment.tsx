import React,{useLayoutEffect,useRef,useState} from 'react';
import type {HelpAttachment} from '../helpApi';
import type {HelpDownloadProgress} from '../helpAttachmentDownload';
import {HelpFileRow} from './HelpFileRow';

type Props={file:HelpAttachment;uploading?:boolean;scope?:unknown;trailing?:React.ReactNode;onPress:(file:HelpAttachment,signal?:AbortSignal,onProgress?:(value:HelpDownloadProgress)=>void)=>Promise<unknown>|void;onError:(text:string)=>void};
/** Each recycled cell owns one cancellable transfer and fences its byte updates. */
export function HelpFileAttachment({file,uploading=false,scope,trailing,onPress,onError}:Props){
 const [state,setState]=useState<'idle'|'busy'|'ready'|'failed'|'cancelled'>('idle');
 const [progress,setProgress]=useState<HelpDownloadProgress>();
 const generation=useRef(0),operation=useRef<AbortController|null>(null),mounted=useRef(false);
 useLayoutEffect(()=>{
  const version=++generation.current;mounted.current=true;operation.current=null;setState('idle');setProgress(undefined);
  return()=>{if(generation.current===version){mounted.current=false;operation.current?.abort();operation.current=null;}};
 },[file.id,file.url,scope]);
 async function download(){
  if(uploading||operation.current||!mounted.current)return;
  const job=new AbortController(),version=generation.current;operation.current=job;setState('busy');
  setProgress({downloaded:0,total:file.size>0?file.size:null});
  const valid=()=>mounted.current&&generation.current===version&&operation.current===job&&!job.signal.aborted;
  try{
   const result=await onPress(file,job.signal,value=>{if(valid())setProgress(previous=>previous?.downloaded===value.downloaded&&previous?.total===value.total?previous:value);});
   if(valid())setState(result===false?'failed':'ready');
  }catch{if(valid()){setState('failed');onError('Не удалось скачать файл. Попробуйте ещё раз.');}}
  finally{if(valid())operation.current=null;}
 }
 function cancel(){
  const job=operation.current;if(!job)return;
  job.abort();operation.current=null;setState('cancelled');setProgress(undefined);
 }
 return <HelpFileRow file={file} state={state} progress={progress} uploading={uploading} trailing={trailing}
  testID={`help-file-attachment-${file.id}`} onPress={()=>void download()} onCancel={state==='busy'?cancel:undefined}/>;
}
