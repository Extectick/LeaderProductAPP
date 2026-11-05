import {createContext,useContext} from 'react';
import type {EntityTarget} from '../../shared/entityLinks';

export type EntityCardNavigation={isOpen:boolean;openEntity:(target:EntityTarget,title?:string)=>boolean;openEntityLink:(url:string,title?:string)=>boolean;close:()=>void;back:()=>void};
export const EntityCardContext=createContext<EntityCardNavigation>({isOpen:false,openEntity:()=>false,openEntityLink:()=>false,close:()=>{},back:()=>{}});
export const useEntityCards=()=>useContext(EntityCardContext);
