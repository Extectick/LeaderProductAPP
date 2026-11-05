import type {EntityTarget} from '../../shared/entityLinks';
import type {EntityCardState} from './entityCardState';
export type EntityCardHostProps={
 state:EntityCardState;userId:number;
 onClose:()=>void;onBack:()=>void;onDismiss:()=>void;
 onOpen:(target:EntityTarget,title?:string)=>boolean;
 onTitle:(key:number,title:string)=>void;onScroll:(key:number,offset:number)=>void;
 onConnect:(baseKey:string)=>void;
};
