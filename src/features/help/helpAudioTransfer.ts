import {useSyncExternalStore} from 'react';
import {Platform} from 'react-native';
import {API_BASE_URL} from '@/utils/config';
import type {HelpAttachment, HelpFile, HelpMediaResolveOptions, HelpTransferProgress} from './helpApi';

const uploads=new Map<string,HelpTransferProgress>();
const listeners=new Set<()=>void>();
export function publishHelpUploadProgress(uri:string,value:HelpTransferProgress){
  uploads.delete(uri);uploads.set(uri,value);
  if(uploads.size>100)uploads.delete(uploads.keys().next().value!);
  listeners.forEach(listener=>listener());
}
export function clearHelpUploadProgress(uri:string){if(uploads.delete(uri))listeners.forEach(listener=>listener());}
export function useHelpUploadProgress(uri?:string){
  return useSyncExternalStore(callback=>{listeners.add(callback);return()=>{listeners.delete(callback);};},()=>uri?uploads.get(uri):undefined,()=>undefined);
}

const blobs=new Map<string,Blob>();
const recentlyUsed=new Map<string,number>();
const touch=(path:string)=>{recentlyUsed.delete(path);recentlyUsed.set(path,Date.now());if(recentlyUsed.size>128)recentlyUsed.delete(recentlyUsed.keys().next().value!);};
let pruning:Promise<void>=Promise.resolve();
function pruneNativeAudio(path:string){
  pruning=pruning.catch(()=>{}).then(async()=>{
    const fs:typeof import('expo-file-system/legacy')=require('expo-file-system/legacy');
    if(typeof fs.readDirectoryAsync!=='function')return;
    const root=path.slice(0,path.lastIndexOf('/')+1),names=await fs.readDirectoryAsync(root);
    const entries=(await Promise.all(names.filter(name=>!name.endsWith('.part')).map(async name=>{
      const uri=root+name,info=await fs.getInfoAsync(uri);return info.exists&&!info.isDirectory?{uri,size:info.size,at:(info.modificationTime??0)*1000}:null;
    }))).filter((entry):entry is NonNullable<typeof entry>=>entry!==null).sort((a,b)=>a.at-b.at);
    let bytes=entries.reduce((sum,entry)=>sum+entry.size,0),count=entries.length;
    for(const entry of entries){
      if(bytes<=64*1024*1024&&count<=64)break;
      // Do not unlink a track while a recently-started native player owns it.
      if(entry.uri===path||Date.now()-(recentlyUsed.get(entry.uri)??0)<10*60*1000)continue;
      await fs.deleteAsync(entry.uri,{idempotent:true});bytes-=entry.size;count--;recentlyUsed.delete(entry.uri);
    }
  }).catch(()=>{});
}
const cacheKey=(userId:number,id:string)=>`${API_BASE_URL}:${userId}:${id}`;
function rememberBlob(key:string,blob:Blob){
  blobs.delete(key);blobs.set(key,blob);
  let bytes=0;for(const value of blobs.values())bytes+=value.size;
  while(blobs.size>64||bytes>64*1024*1024){const first=blobs.keys().next().value;if(first===undefined)break;bytes-=blobs.get(first)!.size;blobs.delete(first);}
}
function audioPath(userId:number,attachment:HelpAttachment){
  const fs:typeof import('expo-file-system/legacy')=require('expo-file-system/legacy');
  if(!fs.cacheDirectory)throw new Error('Кеш аудио недоступен');
  const ext=attachment.name?.match(/\.([a-z0-9]{1,8})$/i)?.[1]||'m4a';
  return `${fs.cacheDirectory}help-audio/${encodeURIComponent(API_BASE_URL)}/${userId}/${encodeURIComponent(attachment.id)}.${ext}`;
}
/** Called only after the owning account has been verified by helpApi. */
export async function readCachedHelpAudio(userId:number,attachment:HelpAttachment):Promise<string|null>{
  if(Platform.OS==='web'){const blob=blobs.get(cacheKey(userId,attachment.id));return blob?URL.createObjectURL(blob):null;}
  const fs:typeof import('expo-file-system/legacy')=require('expo-file-system/legacy');
  const path=audioPath(userId,attachment),info=await fs.getInfoAsync(path).catch(()=>null);
  if(info?.exists&&!info.isDirectory&&(!attachment.size||info.size===attachment.size)){touch(path);return path;}return null;
}
/** Keep an independent cache copy before outbox/draft cleanup removes the recording. */
export async function rememberUploadedHelpAudio(userId:number,attachment:HelpAttachment,file:HelpFile){
  if(attachment.kind!=='AUDIO')return;
  if(Platform.OS==='web'){
    const blob=file.file??await(await fetch(file.uri)).blob();
    if(attachment.size&&blob.size!==attachment.size)return;
    rememberBlob(cacheKey(userId,attachment.id),blob);return;
  }
  const fs:typeof import('expo-file-system/legacy')=require('expo-file-system/legacy');
  const path=audioPath(userId,attachment);
  await fs.makeDirectoryAsync(path.slice(0,path.lastIndexOf('/')+1),{intermediates:true});
  await fs.copyAsync({from:file.uri,to:path});
  touch(path);pruneNativeAudio(path);
}
export function rememberDownloadedHelpAudio(userId:number,attachment:HelpAttachment,blob:Blob){rememberBlob(cacheKey(userId,attachment.id),blob);}
export async function readHelpAudioResponse(response:Response,attachment:HelpAttachment,options?:HelpMediaResolveOptions){
  const signal=options?.signal;signal?.throwIfAborted();
  const header=Number(response.headers?.get('content-length'));
  let total=Number.isFinite(header)&&header>0?header:attachment.size>0?attachment.size:null,transferred=0,last=0;
  const publish=(force=false)=>{const now=Date.now();if(force||now-last>80){last=now;options?.onProgress?.({transferred,total:total!==null&&transferred<=total?total:null});}};
  publish(true);
  const verify=(size:number)=>{if(attachment.size>0&&size!==attachment.size)throw new Error('Неполное голосовое сообщение');if(size>20*1024*1024)throw new Error('Голосовое сообщение слишком большое');};
  if(!response.body?.getReader){const blob=await response.blob();signal?.throwIfAborted();verify(blob.size);transferred=blob.size;total=blob.size;publish(true);return blob;}
  const reader=response.body.getReader(),chunks:Uint8Array<ArrayBuffer>[]=[];
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
  let complete=false;
  try{while(true){signal?.throwIfAborted();const {done,value}=await reader.read();signal?.throwIfAborted();if(done)break;if(value){const chunk=new Uint8Array(value);chunks.push(chunk);transferred+=chunk.length;if(transferred>Math.min(attachment.size||Infinity,20*1024*1024))throw new Error('Некорректный размер голосового сообщения');publish();}}
    const blob=new Blob(chunks,{type:attachment.mimeType});verify(blob.size);total=blob.size;publish(true);complete=true;return blob;
  }finally{signal?.removeEventListener('abort',cancel);if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function downloadNativeHelpAudio(userId:number,attachment:HelpAttachment,uri:string,headers:Record<string,string>,options?:HelpMediaResolveOptions){
  const fs:typeof import('expo-file-system/legacy')=require('expo-file-system/legacy');
  const path=audioPath(userId,attachment),temporary=`${path}.${Date.now()}-${Math.random().toString(36).slice(2)}.part`,signal=options?.signal;
  signal?.throwIfAborted();await fs.makeDirectoryAsync(path.slice(0,path.lastIndexOf('/')+1),{intermediates:true});
  const task=fs.createDownloadResumable(uri,temporary,{headers},value=>{
    if(!signal?.aborted)options?.onProgress?.({transferred:value.totalBytesWritten,total:value.totalBytesExpectedToWrite>0?value.totalBytesExpectedToWrite:null});
  });
  const cancel=()=>{void task.cancelAsync().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
  try{signal?.throwIfAborted();const result=await task.downloadAsync();signal?.throwIfAborted();
    if(!result||result.status!==200)return {status:result?.status??0,uri:''};
    const info=await fs.getInfoAsync(temporary);if(!info.exists||info.isDirectory||(attachment.size>0&&info.size!==attachment.size))throw new Error('Неполное голосовое сообщение');
    signal?.throwIfAborted();await fs.moveAsync({from:temporary,to:path});touch(path);pruneNativeAudio(path);
    options?.onProgress?.({transferred:info.size,total:info.size});return{status:200,uri:path};
  }finally{signal?.removeEventListener('abort',cancel);await task.cancelAsync().catch(()=>{});await fs.deleteAsync(temporary,{idempotent:true}).catch(()=>{});}
}
