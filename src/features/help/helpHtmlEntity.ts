import {buildEntityLink,parseEntityLink,type EntityTarget} from '@/src/shared/entityLinks';

export const HELP_HTML_IMAGE_MAX_BYTES=256*1024;
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Only small, raster bytes returned by the authenticated entity preview enter HTML. */
export function validateHelpHtmlImageDataUrl(value:unknown):string {
 if(typeof value!=='string'||value.length>Math.ceil(HELP_HTML_IMAGE_MAX_BYTES/3)*4+40)throw Error('HELP_HTML_IMAGE_INVALID');
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match||match[2].length%4)throw Error('HELP_HTML_IMAGE_INVALID');
 const encoded=match[2],size=encoded.length/4*3-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
 if(size<12||size>HELP_HTML_IMAGE_MAX_BYTES)throw Error('HELP_HTML_IMAGE_INVALID');
 const bytes:number[]=[];
 for(let i=0;i<16;i+=4){const n=alphabet.indexOf(encoded[i])*262144+alphabet.indexOf(encoded[i+1])*4096+alphabet.indexOf(encoded[i+2])*64+alphabet.indexOf(encoded[i+3]);bytes.push((n>>>16)&255,(n>>>8)&255,n&255);}
 const ascii=(from:number,to:number)=>String.fromCharCode(...bytes.slice(from,to));
 if(match[1]==='png'&&bytes.slice(0,8).join(',')!=='137,80,78,71,13,10,26,10'||
    match[1]==='jpeg'&&(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)||
    match[1]==='webp'&&(ascii(0,4)!=='RIFF'||ascii(8,12)!=='WEBP'))throw Error('HELP_HTML_IMAGE_INVALID');
 return value;
}
export function helpHtmlEntityTarget(url:unknown):EntityTarget|null {
 if(typeof url!=='string')return null;
 const target=parseEntityLink(url);return target&&buildEntityLink(target)===url?target:null;
}
export type HelpHtmlEntityPreview={target:EntityTarget;title:string;imageDataUrl?:string};
export async function loadHelpHtmlEntityPreview(url:string,userId:number,signal:AbortSignal):Promise<HelpHtmlEntityPreview>{
 const target=helpHtmlEntityTarget(url);
 if(!target||!Number.isSafeInteger(userId)||userId<1)throw Error('HELP_HTML_ENTITY_INVALID');
 signal.throwIfAborted();
 // Keep authenticated transport outside the static inert-document dependency graph.
 const {httpRequest}=require('@/src/shared/api/httpClient') as typeof import('@/src/shared/api/httpClient');
 const response=await httpRequest<{target:EntityTarget},HelpHtmlEntityPreview>('/entity-links/preview',{
  method:'POST',body:{target},expectedUserId:userId,signal,networkRetryCount:0,timeoutMs:60000,
 });
 signal.throwIfAborted();
 const data=response.data;
 if(!response.ok||!data||typeof data.title!=='string'||!data.title.trim()||data.title.length>1000||
    !data.target||JSON.stringify(helpHtmlEntityTarget(buildEntityLink(data.target)))!==JSON.stringify(target))throw Error('HELP_HTML_ENTITY_UNAVAILABLE');
 return {target,title:data.title,...(data.imageDataUrl!==undefined?{imageDataUrl:validateHelpHtmlImageDataUrl(data.imageDataUrl)}:{})};
}
