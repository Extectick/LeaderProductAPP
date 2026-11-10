import {createContext} from 'react';
import {APP_LAYOUT} from '@/src/shared/layout/appLayout';

/** One window geometry for HTML and linked cards. The body measures inside it. */
export function helpWebViewerFrame(width:number,height:number,expanded=false){
 const compact=width<=APP_LAYOUT.compactMax;
 const windowed=!compact&&!expanded;
 const margin=windowed?Math.min(16,Math.max(0,(height-120)/2)):0;
 const panelWidth=windowed?Math.min(720,Math.max(1,width-margin*2)):width;
 return {compact,windowed,top:margin,left:windowed?width-margin-panelWidth:0,width:panelWidth,height:Math.max(1,height-margin*2),borderRadius:windowed?20:0};
}

/** RN Web normalizes mouse input into touches too; check the original event type. */
export function isHelpViewerTouch(event:{nativeEvent?:unknown}){
 const native=event.nativeEvent as {type?:string;pointerType?:string}|undefined;
 return native?.pointerType==='touch'||Boolean(native?.type?.startsWith('touch'));
}

export type HelpViewerWindowControls={
 canExpand?:boolean;
 expanded:boolean;
 onToggleExpanded:()=>void;
 registerMenuDismiss?:(handler:(()=>boolean)|null)=>void;
};
export const HelpViewerWindowContext=createContext<HelpViewerWindowControls|null>(null);
