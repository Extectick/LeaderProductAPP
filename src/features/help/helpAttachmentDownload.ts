import {Platform} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type {HelpAttachment} from './helpApi';
import type {ResolveHelpMedia} from './components/HelpMedia';

export type HelpDownloadProgress={downloaded:number;total:number|null};
let downloadSequence=0;

function aborted(){const error=new Error('Загрузка отменена');error.name='AbortError';return error;}
function checkActive(signal?:AbortSignal){if(signal?.aborted)throw aborted();}
function abortable<T>(work:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return work;
 return new Promise<T>((resolve,reject)=>{
  const cancel=()=>{signal.removeEventListener('abort',cancel);reject(aborted());};
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted)cancel();
  void work.then(value=>{signal.removeEventListener('abort',cancel);if(signal.aborted)reject(aborted());else resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(signal.aborted?aborted():error);});
 });
}
const knownSize=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.floor(value):null;

/** Real transfer bytes only; progress observers cannot fail the transfer. */
export async function downloadHelpAttachment(attachment:HelpAttachment,resolve:ResolveHelpMedia,signal?:AbortSignal,onProgress?:(value:HelpDownloadProgress)=>void):Promise<void>{
 checkActive(signal);
 let downloaded=0,total=knownSize(attachment.size),lastPublished=-Infinity;
 const publish=(bytes:number,expected:number|null,complete=false)=>{
  if(signal?.aborted)return;
  if(Number.isFinite(bytes))downloaded=Math.max(downloaded,Math.floor(Math.max(0,bytes)));
  total=expected;
  // A server's stale length must not turn excess received bytes into a false100%.
  if(total!==null&&downloaded>total)total=null;
  const now=Date.now();
  if(!complete&&now-lastPublished<100)return;
  lastPublished=now;
  try{onProgress?.({downloaded,total});}catch{/* The observer owns presentation. */}
 };
 publish(0,total);
 checkActive(signal);
 const source=await abortable(resolve(attachment),signal);
 checkActive(signal);
 if(Platform.OS==='web'){
  const response=await abortable(fetch(source.uri,{headers:source.headers,...(signal?{signal}:{})}),signal);
  checkActive(signal);
  if(!response.ok)throw new Error('Не удалось скачать файл');
  const header=response.headers?.get('content-length');
  const expected=header!==null&&header!==undefined&&/^\d+$/.test(header)?Number(header):null;
  total=expected!==null&&Number.isSafeInteger(expected)?expected:total;
  let blob:Blob;
  if(response.body?.getReader){
   const reader=response.body.getReader(),chunks:Uint8Array<ArrayBuffer>[]=[];
   try{
    while(true){
     const {done,value}=await abortable(reader.read(),signal);checkActive(signal);if(done)break;
     if(value){const chunk=new Uint8Array(value);chunks.push(chunk);publish(downloaded+chunk.byteLength,total);}
    }
    blob=new Blob(chunks,{type:response.headers?.get('content-type')||attachment.mimeType});
   }finally{
    if(signal?.aborted)await reader.cancel().catch(()=>{});
    reader.releaseLock();
   }
  }else blob=await abortable(response.blob(),signal);
  checkActive(signal);publish(blob.size,blob.size,true);checkActive(signal);
  const url=URL.createObjectURL(blob);
  try{checkActive(signal);const link=document.createElement('a');link.href=url;link.download=attachment.name;link.click();}
  finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}
  return;
 }
 const filename=attachment.name.replace(/[^\p{L}\p{N}._-]/gu,'_')||'file';
 const id=attachment.id.replace(/[^a-zA-Z0-9_-]/g,'_');
 // Every invocation owns its path, including galleries without a signal.
 const path=`${FileSystem.cacheDirectory}help-${id}-${Date.now()}-${++downloadSequence}-${filename}`;
 let task:ReturnType<typeof FileSystem.createDownloadResumable>|undefined,cancellation:Promise<void>|undefined,complete=false,keepFile=false;
 const cancel=()=>{if(task&&!complete)cancellation=task.cancelAsync().catch(()=>{});};
 try{
  task=FileSystem.createDownloadResumable(source.uri,path,{headers:source.headers},value=>{
   if(!complete)publish(value.totalBytesWritten,knownSize(value.totalBytesExpectedToWrite)??total);
  });
  checkActive(signal);signal?.addEventListener('abort',cancel,{once:true});
  const result=await abortable(task.downloadAsync(),signal);checkActive(signal);
  complete=true;signal?.removeEventListener('abort',cancel);
  if(!result||result.status!==200)throw new Error('Не удалось скачать файл');
  // Tiny responses may finish without a native progress event. Read their
  // actual cached length rather than manufacturing received bytes from metadata.
  let size:number|null=null;
  try{
   const info=await abortable(FileSystem.getInfoAsync(result.uri),signal);checkActive(signal);
   if(info.exists&&'size' in info&&Number.isFinite(info.size))size=Math.max(0,info.size);
  }catch(error){checkActive(signal);/* A missing size must not break an otherwise valid download. */}
  keepFile=true;
  publish(size??downloaded,size??total,true);
  const canShare=await abortable(Sharing.isAvailableAsync(),signal);checkActive(signal);
  if(canShare){await Sharing.shareAsync(result.uri,{mimeType:attachment.mimeType,dialogTitle:'Сохранить файл'});checkActive(signal);}
 }finally{
  signal?.removeEventListener('abort',cancel);
  if(signal?.aborted&&!complete&&!cancellation)cancel();
  // SDK58 DownloadResumable retains its JS progress subscription after success.
  // The public cancel method removes it; completed native tasks are a no-op and
  // the downloaded cache file is preserved.
  if(task&&!cancellation)cancellation=task.cancelAsync().catch(()=>{});
  if(cancellation)await cancellation;
  if(signal?.aborted||!keepFile)await FileSystem.deleteAsync(path,{idempotent:true}).catch(()=>{});
 }
}
