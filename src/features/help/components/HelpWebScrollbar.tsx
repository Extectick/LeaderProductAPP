import type {RefObject} from 'react';
export type HelpWebScrollbarProps={scrollRef:RefObject<{getScrollableNode:()=>unknown}|null>;scrollId:string;top:number;bottom:number;active:boolean};
/** Native keeps its own scroll indicator and responder. */
export function HelpWebScrollbar(_props:HelpWebScrollbarProps){return null;}
