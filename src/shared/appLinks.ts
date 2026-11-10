import {normalizeEntityTarget,parseEntityLink,type EntityTarget} from './entityLinks';
import {parseHelpChatLink} from '../features/help/helpChatLink';
import {parseHelpHtmlLink} from '../features/help/helpHtml';
import {normalizeWebUrl} from '../features/webPages/webPagePolicy';

export type AppHelpDestination={ticketId:number;messageId?:number;htmlId:string};
export type AppLink =
 | {kind:'entity';target:EntityTarget}
 | {kind:'chat';ticketId:number}
 | {kind:'html';id:string}
 | {kind:'help-destination';destination:AppHelpDestination}
 | {kind:'web';url:string}
 | {kind:'system';url:string};
export type AppLinkAdapters={
 openEntity:(target:EntityTarget,title?:string)=>boolean;
 openWeb?:(url:string,title?:string)=>boolean;
 canOpenHtml?:(id:string)=>boolean;
 openHtml?:(id:string)=>void;
 openChat?:(ticketId:number)=>void;
 openHelpDestination?:(destination:AppHelpDestination)=>void;
 openSystem?:(url:string)=>void;
};

/** A copied artifact permalink re-enters the protected Help route. It is never
 * an instruction to fetch a standalone attachment by an invented ID. */
export function parseAppHelpDestination(value:unknown):AppHelpDestination|null{
 if(typeof value!=='string'||value.length>8192||/[\u0000-\u0020\u007f\\]/.test(value)||!/^leaderproduct:\/\/services\/help\?/.test(value))return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='leaderproduct:'||url.hostname!=='services'||url.pathname!=='/help'||url.username||url.password||url.port||url.hash)return null;
  const params=url.searchParams,allowed=new Set(['ticketId','messageId','htmlId']);
  for(const key of params.keys())if(!allowed.has(key)||params.getAll(key).length!==1)return null;
  const integer=(input:string|null)=>input&&/^[1-9]\d{0,9}$/.test(input)&&Number(input)<=2147483647?Number(input):null;
  const ticketId=integer(params.get('ticketId')),message= params.has('messageId')?integer(params.get('messageId')):undefined,htmlId=params.get('htmlId');
  if(!ticketId||message===null||!htmlId||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(htmlId))return null;
  return {ticketId,...(message===undefined?{}:{messageId:message}),htmlId:htmlId.toLowerCase()};
 }catch{return null;}
}

/** These copied service URLs identify the original personal 1C order. Keep the
 * allowlist at the click boundary; direct browser routes retain their own flow. */
function parseClientOrderDestination(value:string):EntityTarget|null{
 // Match the original path before URL normalization can remove dot segments.
 // Only this configured development app origin is trusted as an app route.
 if(!/^(?:https:\/\/app\.dev\.lidprod\.ru\/services|leaderproduct:\/\/services)\/client_orders\?/.test(value)||value.includes('#'))return null;
 try{
  const params=new URL(value).searchParams;
  const allowed=new Set(['orderGuid','orderBaseKey']);
  for(const key of params.keys())if(!allowed.has(key)||params.getAll(key).length!==1)return null;
  return normalizeEntityTarget({v:1,source:'onec',baseKey:params.get('orderBaseKey'),metaType:'Documents',name:'ЗаказКлиента',guid:params.get('orderGuid')});
 }catch{return null;}
}

/** Classification is shared by Markdown, inert HTML and viewer links. It never
 * turns an unknown internal route into a browser URL or authorization grant. */
export function classifyAppLink(value:unknown):AppLink|null{
 if(typeof value!=='string'||value.length>8192||/[\u0000-\u0020\u007f\\]/.test(value))return null;
 const ticketId=parseHelpChatLink(value);if(ticketId)return {kind:'chat',ticketId};
 const destination=parseAppHelpDestination(value);if(destination)return {kind:'help-destination',destination};
 const id=parseHelpHtmlLink(value);if(id)return {kind:'html',id};
 const target=parseEntityLink(value)??parseClientOrderDestination(value);if(target)return {kind:'entity',target};
 const url=normalizeWebUrl(value);if(url)return {kind:'web',url};
 if(/^(?:mailto:[^?\s]+(?:\?[^\s]*)?|tel:\+?[\d().-]+)$/i.test(value)&&!/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value))return {kind:'system',url:value};
 return null;
}

/** Only an explicit UI action calls this dispatcher. A website never receives
 * the handlers themselves or a generic native/API message bridge. */
export function openAppLink(value:unknown,adapters:AppLinkAdapters,title?:string):boolean{
 const link=classifyAppLink(value);if(!link)return false;
 switch(link.kind){
  case 'entity':return adapters.openEntity(link.target,title);
  case 'web':return adapters.openWeb?.(link.url,title)??false;
  case 'html':if(!adapters.canOpenHtml?.(link.id)||!adapters.openHtml)return false;adapters.openHtml(link.id);return true;
  case 'help-destination':if(!adapters.openHelpDestination)return false;adapters.openHelpDestination(link.destination);return true;
  case 'chat':if(!adapters.openChat)return false;adapters.openChat(link.ticketId);return true;
  case 'system':if(!adapters.openSystem)return false;adapters.openSystem(link.url);return true;
 }
}
