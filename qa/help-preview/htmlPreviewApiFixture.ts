/** Loader adapters only: parsing, rendering, cache and scope fences remain real. */
export * from '../../src/features/help/helpApi';
import type {HelpAttachment} from '../../src/features/help/helpApi';
import type {HelpHtmlArtifact} from '../../src/features/help/helpHtml';
import {QA_USER_ID} from './realServiceEnvironment';

export const htmlPreviewId='8cb01504-f89b-4e55-ad30-f8f6eb686547';
export const htmlPreviewAttachment:HelpAttachment={id:'qa-html-61',name:`${htmlPreviewId}.help-html.json`,kind:'FILE',mimeType:'application/vnd.leaderproduct.help-html+json',size:1024,url:'/qa/html-61',height:128};
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAJElEQVR4nGPY3Bq3uTXu8tx8NMRAD4m6WKe6WKcpeX5oiHQJAA+ZZk1s+gD0AAAAAElFTkSuQmCC';
const artifact:HelpHtmlArtifact={version:1,id:htmlPreviewId,title:'Тестовый профиль',description:'QA карточка высотой 128 px',
 entity:{url:`leaderproduct://entity/v1/user/${QA_USER_ID}`},
 compact:{html:'<article class="card"><img src="help-entity-image" alt="Фото профиля"><div><strong>Тестовый профиль</strong><p>Локальная карточка · 128 px</p></div></article>',
 css:'.card{height:128px;display:flex;align-items:center;gap:16px;padding:20px;border-radius:20px;background:#edf3fb;color:#152237;font:16px/1.5 system-ui}.card img{width:64px;height:64px;border-radius:50%;image-rendering:pixelated}.card p{margin:4px 0;color:#536b8c;font-size:14px}'}};
const counts={artifactStarted:0,artifactCompleted:0,artifactAborted:0,imageStarted:0,imageCompleted:0,imageAborted:0};
function delayMs(name:string,fallback:number){const value=typeof location==='undefined'?null:new URLSearchParams(location.search).get(name);return value===null?fallback:Math.max(0,Math.min(10000,Number(value)||0));}
function delay(ms:number,signal:AbortSignal){
 signal.throwIfAborted();
 return new Promise<void>((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason??new Error('QA_ABORTED'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  signal.addEventListener('abort',abort,{once:true});
 });
}
export async function loadHelpAttachmentText(file:HelpAttachment,userId:number,signal:AbortSignal){
 if(file.id!==htmlPreviewAttachment.id||userId!==QA_USER_ID)throw Error('QA_HTML_SCOPE_MISMATCH');
 ++counts.artifactStarted;
 try{await delay(delayMs('artifactDelay',700),signal);++counts.artifactCompleted;return JSON.stringify(artifact);}
 catch(error){if(signal.aborted)++counts.artifactAborted;throw error;}
}
export async function httpRequest(path:string,options:{expectedUserId?:number;signal?:AbortSignal;body?:any}){
 if(path!=='/entity-links/preview'||options.expectedUserId!==QA_USER_ID||options.body?.target?.id!==String(QA_USER_ID))return {ok:false,status:403,message:'QA_HTML_SCOPE_MISMATCH'};
 ++counts.imageStarted;
 try{await delay(delayMs('imageDelay',1300),options.signal??new AbortController().signal);++counts.imageCompleted;return {ok:true,status:200,data:{target:options.body.target,title:artifact.title,imageDataUrl:image}};}
 catch(error){if(options.signal?.aborted)++counts.imageAborted;throw error;}
}
export const htmlPreviewProbe=()=>({...counts,artifactDelay:delayMs('artifactDelay',700),imageDelay:delayMs('imageDelay',1300)});
