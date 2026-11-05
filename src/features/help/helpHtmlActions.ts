import {Platform} from 'react-native';
import {jwtDecode} from 'jwt-decode';
import {getAccessToken} from '@/utils/tokenService';
import {helpHtmlDocument,type HelpHtmlArtifact} from './helpHtml';

type Scope={expectedUserId:number;signal:AbortSignal;isCurrent?:()=>boolean};
let exportSequence=0;
function cancelled():never{const error=new Error('Действие отменено');error.name='AbortError';throw error;}
async function assertActive(scope:Scope){
 if(scope.signal.aborted||scope.isCurrent?.()===false)cancelled();
 const token=await getAccessToken();
 let id:number;try{id=Number(jwtDecode<{userId?:number}>(token||'').userId);}catch{cancelled();}
 if(!Number.isSafeInteger(scope.expectedUserId)||scope.expectedUserId<1||id!==scope.expectedUserId||scope.signal.aborted||scope.isCurrent?.()===false)cancelled();
}
export function helpHtmlShareLink(link:string,id:string):string{
 const url=new URL(link);
 const keys=[...url.searchParams.keys()],messageId=url.searchParams.get('messageId');
 if(url.protocol!=='leaderproduct:'||url.hostname!=='services'||url.pathname!=='/help'||url.username||url.password||url.hash||
   !/^[1-9][0-9]*$/.test(url.searchParams.get('ticketId')||'')||!Number.isSafeInteger(Number(url.searchParams.get('ticketId')))||
   url.searchParams.get('htmlId')?.toLowerCase()!==id.toLowerCase()||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||
   messageId!==null&&(!/^[1-9][0-9]*$/.test(messageId)||!Number.isSafeInteger(Number(messageId)))||
   keys.some(key=>!['ticketId','messageId','htmlId'].includes(key))||keys.length!==(messageId===null?2:3))throw Error('HELP_HTML_LINK_INVALID');
 return url.toString();
}
/** Copy an application route only; authenticated attachment addresses never leave this helper. */
export async function copyHelpHtmlLink(artifact:HelpHtmlArtifact,link:string,scope:Scope):Promise<void>{
 const value=helpHtmlShareLink(link,artifact.id);
 await assertActive(scope);
 const Clipboard=require('expo-clipboard') as typeof import('expo-clipboard');
 await assertActive(scope);
 if(await Clipboard.setStringAsync(value)===false)throw Error('HELP_HTML_COPY_FAILED');
}
/** Export the already-authorized full document, never its JSON transport envelope or auth token. */
export async function downloadHelpHtml(artifact:HelpHtmlArtifact,color:string,scope:Scope,imageDataUrl?:string):Promise<void>{
 if(!artifact.full)throw Error('HELP_HTML_FULL_REQUIRED');
 await assertActive(scope);
 const html=helpHtmlDocument(artifact.full,color,false,0,imageDataUrl);
 const stem=artifact.title.replace(/[^\p{L}\p{N} _().-]/gu,'_').replace(/^\.+/,'').slice(0,80).trim()||'Пример';
 const filename=`${stem}-${artifact.id.slice(0,8)}.html`;
 if(Platform.OS==='web'){
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));let clicked=false;
  try{
   await assertActive(scope);
   const link=document.createElement('a');link.href=url;link.download=filename;
   document.body.appendChild(link);try{link.click();clicked=true;}finally{link.remove();}
  }finally{if(clicked)setTimeout(()=>URL.revokeObjectURL(url),60000);else URL.revokeObjectURL(url);}
  return;
 }
 const fs=require('expo-file-system/legacy') as typeof import('expo-file-system/legacy'),sharing=require('expo-sharing') as typeof import('expo-sharing');
 await assertActive(scope);if(!fs.cacheDirectory)throw Error('HELP_HTML_EXPORT_UNAVAILABLE');
 const directory=`${fs.cacheDirectory}help-html-export-${Date.now()}-${++exportSequence}/`,uri=directory+encodeURIComponent(filename);
 try{
  await fs.makeDirectoryAsync(directory,{intermediates:true});await assertActive(scope);
  await fs.writeAsStringAsync(uri,html,{encoding:fs.EncodingType.UTF8});await assertActive(scope);
  if(!await sharing.isAvailableAsync())throw Error('HELP_HTML_EXPORT_UNAVAILABLE');
  await assertActive(scope);await sharing.shareAsync(uri,{mimeType:'text/html',UTI:'public.html',dialogTitle:'Скачать HTML'});
 }finally{await fs.deleteAsync(directory,{idempotent:true}).catch(()=>{});}
}
