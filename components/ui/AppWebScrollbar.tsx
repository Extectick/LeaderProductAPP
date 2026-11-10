import type {RefObject} from 'react';
export type AppWebScrollbarProps={
  scrollRef:RefObject<{getScrollableNode:()=>unknown}|null>;scrollId:string;top:number;bottom:number;active:boolean;
  colors:{muted:string};label?:string;testID?:string;thumbTestID?:string;
};
/** Native keeps its own scroll indicator and responder. */
export function AppWebScrollbar(_props:AppWebScrollbarProps){return null;}
