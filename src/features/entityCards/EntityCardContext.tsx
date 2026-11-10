import {createContext,useContext,type Context} from 'react';
import type {EntityTarget} from '../../shared/entityLinks';
import type {ViewerHtmlPayload} from '../viewer/viewerTypes';

export type EntityCardNavigation={isOpen:boolean;status?:'ready'|'authentication-required'|'blocked'|'unavailable';openEntity:(target:EntityTarget,title?:string)=>boolean;openEntityLink:(url:string,title?:string)=>boolean;openWeb?:(url:string,title?:string)=>boolean;openHtml?:(payload:ViewerHtmlPayload)=>boolean;releaseHtml?:(scopeId:string)=>void;close:()=>void;back:()=>void};
// Keep the same context identity when Metro re-evaluates this module. No account
// or card data is stored here; each provider still owns and fences its session.
const contexts=globalThis as typeof globalThis&{__LEADER_ENTITY_CARD_CONTEXT_V1__?:Context<EntityCardNavigation>};
export const EntityCardContext=contexts.__LEADER_ENTITY_CARD_CONTEXT_V1__??=
 createContext<EntityCardNavigation>({isOpen:false,status:'unavailable',openEntity:()=>false,openEntityLink:()=>false,openWeb:()=>false,openHtml:()=>false,releaseHtml:()=>{},close:()=>{},back:()=>{}});
export const useEntityCards=()=>useContext(EntityCardContext);
