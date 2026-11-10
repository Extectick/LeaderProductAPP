import React,{useLayoutEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import type {HelpAttachment} from '../helpApi';
import type {HelpDownloadProgress} from '../helpAttachmentDownload';
import {helpHtmlAttachmentId} from '../helpHtml';
import type {ResolveHelpMedia} from './HelpMedia';
import {HelpFileRow} from './HelpFileRow';

export type HelpAssistantFilesProps={attachments:HelpAttachment[];resolve?:ResolveHelpMedia;onError?:(text:string)=>void};
type DownloadOperation={id:string;resolver:ResolveHelpMedia;controller:AbortController;generation:number};
/** Same authenticated file transport and presentation as ordinary messages. */
export function HelpAssistantFiles({attachments,resolve,onError}:HelpAssistantFilesProps){
 const files=attachments.filter(file=>file.kind==='FILE'&&helpHtmlAttachmentId(file)===null);
 const identity=files.map(file=>`${file.id}:${file.url}`).join('|');
 const [downloadingId,setDownloadingId]=useState<string|null>(null),[failedId,setFailedId]=useState<string|null>(null);
 const [cancelledId,setCancelledId]=useState<string|null>(null),[readyIds,setReadyIds]=useState<Set<string>>(()=>new Set());
 const [progress,setProgress]=useState<HelpDownloadProgress>();
 const operation=useRef<DownloadOperation|null>(null),generation=useRef(0),mounted=useRef(false);
 const resolver=useRef(resolve);resolver.current=resolve;
 const report=useRef(onError);report.current=onError;
 useLayoutEffect(()=>{
  const version=++generation.current;mounted.current=true;setDownloadingId(null);setFailedId(null);setCancelledId(null);setReadyIds(new Set());setProgress(undefined);
  return()=>{if(generation.current!==version)return;mounted.current=false;operation.current?.controller.abort();operation.current=null;};
 },[resolve,identity]);
 async function download(file:HelpAttachment){
  if(!resolve||operation.current||!mounted.current)return;
  const current:DownloadOperation={id:file.id,resolver:resolve,controller:new AbortController(),generation:generation.current};
  operation.current=current;setDownloadingId(file.id);setFailedId(null);setCancelledId(null);setProgress({downloaded:0,total:file.size>0?file.size:null});
  const isCurrent=()=>mounted.current&&operation.current===current&&generation.current===current.generation&&resolver.current===current.resolver&&!current.controller.signal.aborted;
  try{
   // Do not initialize gallery/audio for an AI response with no file interaction.
   const {downloadHelpAttachment}=require('./HelpMedia') as typeof import('./HelpMedia');
   await downloadHelpAttachment(file,current.resolver,current.controller.signal,value=>{if(isCurrent())setProgress(previous=>previous?.downloaded===value.downloaded&&previous?.total===value.total?previous:value);});
   if(isCurrent())setReadyIds(previous=>new Set(previous).add(file.id));
  }catch{if(isCurrent()){setFailedId(file.id);report.current?.('Не удалось скачать файл. Попробуйте ещё раз.');}}
  finally{if(isCurrent()){operation.current=null;setDownloadingId(null);setProgress(undefined);}}
 }
 function cancel(id:string){
  const current=operation.current;if(!current||current.id!==id)return;
  current.controller.abort();operation.current=null;setDownloadingId(null);setCancelledId(id);setProgress(undefined);
 }
 if(!files.length)return null;
 return <View testID="help-assistant-files" style={{gap:8,marginTop:8}}>{files.map(file=><HelpFileRow key={file.id} file={file} variant="assistant"
  state={downloadingId===file.id?'busy':failedId===file.id?'failed':cancelledId===file.id?'cancelled':readyIds.has(file.id)?'ready':'idle'}
  progress={downloadingId===file.id?progress:undefined} disabled={!resolve||downloadingId!==null&&downloadingId!==file.id}
  onPress={()=>void download(file)} onCancel={downloadingId===file.id?()=>cancel(file.id):undefined} testID={`help-assistant-file-${file.id}`}/>)}</View>;
}
