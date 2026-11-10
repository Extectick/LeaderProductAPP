import type {EntityTarget} from '../../shared/entityLinks';
import type {EntityCardState} from './entityCardState';
import type {ViewerPageControls} from '../viewer/viewerTypes';
export type EntityCardHostProps={
 state:EntityCardState;userId:number;
 onClose:()=>void;onBack:()=>void;onDismiss:()=>void;
 onOpen:(target:EntityTarget,title?:string)=>boolean;
 onTitle:(key:number,title:string)=>void;onScroll:(key:number,offset:number)=>void;
 onConnect:(baseKey:string)=>void;
 onPageControls?:(frameKey:number,controls:ViewerPageControls|null)=>void;
 onWebLocation?:(frameKey:number,url:string)=>void;
 onRegisterMenuDismiss?:(frameKey:number,handler:(()=>boolean)|null)=>void;
 onReloadPage?:(frameKey:number)=>boolean;
};
