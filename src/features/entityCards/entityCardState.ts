import {buildEntityLink,normalizeEntityTarget,type EntityTarget} from '../../shared/entityLinks';
import {normalizeWebUrl} from '../webPages/webPagePolicy';
import type {ViewerHtmlPayload} from '../viewer/viewerTypes';

export type EntityCardFrame = {key:number;kind:'entity';target:EntityTarget;title:string;scrollOffset:number};
export type EntityConnectionFrame = {key:number;kind:'connection';baseKey:string;title:string;scrollOffset:number};
export type WebViewerFrame={key:number;kind:'web';url:string;currentUrl:string;title:string;scrollOffset:number};
export type HtmlViewerFrame={key:number;kind:'html';payload:ViewerHtmlPayload;title:string;scrollOffset:number};
export type EntityFrame = EntityCardFrame|EntityConnectionFrame|WebViewerFrame|HtmlViewerFrame;
export type EntityCardState = {account:string;session:number;sequence:number;frames:EntityFrame[];closing:boolean};
export const initialEntityCardState:EntityCardState={account:'',session:0,sequence:0,frames:[],closing:false};
export type EntityCardAction =
 | {type:'account';account:string}
 | {type:'open';account:string;target:EntityTarget;title?:string}
 | {type:'connect';baseKey:string}
 | {type:'web';account:string;url:string;title?:string}
 | {type:'html';account:string;payload:ViewerHtmlPayload}
 | {type:'release-html';scopeId:string}
 | {type:'web-location';key:number;url:string}
 | {type:'back'} | {type:'close'} | {type:'dismissed';session:number}
 | {type:'title';key:number;title:string}
 | {type:'scroll';key:number;offset:number};

export function entityDefaultTitle(target:EntityTarget):string {
 if(target.source==='app')return target.kind==='product'?'Товар':'Профиль сотрудника';
 if(target.metaType==='Catalogs'&&target.name==='Номенклатура')return 'Номенклатура';
 if(target.metaType==='Documents'&&target.name==='ЗаказКлиента')return 'Заказ клиента';
 return target.name.replace(/([а-яa-z])([А-ЯA-Z])/g,'$1 $2');
}
const cleanTitle=(value:string)=>value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,200);
export function entityCardReducer(state:EntityCardState,action:EntityCardAction):EntityCardState {
 switch(action.type){
  case 'account':return action.account===state.account?state:{...state,account:action.account,session:state.session+1,frames:[],closing:false};
  case 'open':{
   const target=normalizeEntityTarget(action.target);if(!target||!action.account)return state;
   const previous=state.account===action.account&&!state.closing?state.frames:[];
   const url=buildEntityLink(target),existing=previous.findIndex(frame=>frame.kind==='entity'&&buildEntityLink(frame.target)===url);
   if(existing>=0)return {...state,frames:previous.slice(0,existing+1),closing:false};
   const key=state.sequence+1;
   return {account:action.account,session:previous.length?state.session:state.session+1,sequence:key,closing:false,
    frames:[...previous,{key,kind:'entity',target,title:cleanTitle(action.title||'')||entityDefaultTitle(target),scrollOffset:0}]};
  }
  case 'web':{
   const url=normalizeWebUrl(action.url);if(!url||!action.account)return state;
   const previous=state.account===action.account&&!state.closing?state.frames:[];
   const existing=previous.findIndex(frame=>frame.kind==='web'&&frame.currentUrl===url);
   if(existing>=0)return {...state,frames:previous.slice(0,existing+1),closing:false};
   const key=state.sequence+1;
   return {account:action.account,session:previous.length?state.session:state.session+1,sequence:key,closing:false,frames:[...previous,{key,kind:'web',url,currentUrl:url,title:cleanTitle(action.title||'')||new URL(url).hostname,scrollOffset:0}]};
  }
  case 'html':{
   const payload=action.payload;
   if(!action.account||!payload.artifact.full||!payload.scopeId||payload.isCurrent?.()===false)return state;
   const previous=state.account===action.account&&!state.closing?state.frames:[];
   const existing=previous.findIndex(frame=>frame.kind==='html'&&frame.payload.scopeId===payload.scopeId&&frame.payload.artifact.id===payload.artifact.id);
   if(existing>=0)return {...state,frames:previous.slice(0,existing+1),closing:false};
   const key=state.sequence+1;
   return {account:action.account,session:previous.length?state.session:state.session+1,sequence:key,closing:false,frames:[...previous,{key,kind:'html',payload,title:cleanTitle(payload.artifact.title)||'Просмотр',scrollOffset:0}]};
  }
  case 'release-html':{
   const index=state.frames.findIndex(frame=>frame.kind==='html'&&frame.payload.scopeId===action.scopeId);
   return index<0?state:index===0?{...state,frames:[],closing:false}:{...state,frames:state.frames.slice(0,index)};
  }
  case 'web-location':{
   const url=normalizeWebUrl(action.url);if(!url)return state;
   const existing=state.frames.find(frame=>frame.key===action.key);
   if(existing?.kind!=='web'||existing.currentUrl===url)return state;
   return {...state,frames:state.frames.map(frame=>frame.kind==='web'&&frame.key===action.key&&frame.currentUrl!==url?{...frame,currentUrl:url}:frame)};
  }
  case 'connect':{
   const current=state.frames.at(-1);
   if(state.closing||!current||current.kind!=='entity'||current.target.source!=='onec'||current.target.baseKey!==action.baseKey)return state;
   const key=state.sequence+1;
   return {...state,sequence:key,frames:[...state.frames,{key,kind:'connection',baseKey:action.baseKey,title:'Подключение 1С',scrollOffset:0}]};
  }
  case 'back':return state.closing?state:state.frames.length>1?{...state,frames:state.frames.slice(0,-1)}:state.frames.length?{...state,closing:true}:state;
  case 'close':return state.frames.length&&!state.closing?{...state,closing:true}:state;
  case 'dismissed':return action.session!==state.session?state:{...state,frames:[],closing:false};
  case 'title':{
   const title=cleanTitle(action.title);if(!title)return state;
   const frame=state.frames.find(f=>f.key===action.key);if(!frame||frame.title===title)return state;
   return {...state,frames:state.frames.map(f=>f.key===action.key?{...f,title}:f)};
  }
  case 'scroll':{
   if(!Number.isFinite(action.offset))return state;
   const frame=state.frames.find(f=>f.key===action.key),offset=Math.max(0,action.offset);
   if(!frame||frame.scrollOffset===offset)return state;
   return {...state,frames:state.frames.map(f=>f.key===action.key?{...f,scrollOffset:offset}:f)};
  }
 }
}
