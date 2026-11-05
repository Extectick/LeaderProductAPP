import {createContext,useContext,type Context} from 'react';
import type {EntityTarget} from '../../shared/entityLinks';

export type EntityCardNavigation={isOpen:boolean;status?:'ready'|'authentication-required'|'blocked'|'unavailable';openEntity:(target:EntityTarget,title?:string)=>boolean;openEntityLink:(url:string,title?:string)=>boolean;close:()=>void;back:()=>void};
// Keep the same context identity when Metro re-evaluates this module. No account
// or card data is stored here; each provider still owns and fences its session.
const contexts=globalThis as typeof globalThis&{__LEADER_ENTITY_CARD_CONTEXT_V1__?:Context<EntityCardNavigation>};
export const EntityCardContext=contexts.__LEADER_ENTITY_CARD_CONTEXT_V1__??=
 createContext<EntityCardNavigation>({isOpen:false,status:'unavailable',openEntity:()=>false,openEntityLink:()=>false,close:()=>{},back:()=>{}});
export const useEntityCards=()=>useContext(EntityCardContext);
