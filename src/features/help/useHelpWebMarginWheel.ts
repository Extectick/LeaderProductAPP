import {useLayoutEffect,type RefObject} from 'react';
import {Platform,type View} from 'react-native';
import type {HelpTimelineHandle} from './components/HelpTimeline';

export function helpWebWheelPixels(delta:number,mode:number,viewport:number):number {
 if(!Number.isFinite(delta)||!Number.isFinite(viewport)||viewport<=0)return 0;
 return mode===0?delta:mode===1?delta*16:mode===2?delta*viewport:0;
}

/** Only the empty pane itself forwards input. Descendant scroll areas keep
 * native wheel behavior, and Ctrl+wheel remains browser zoom. */
export function bindHelpMarginWheel(node:HTMLElement,forward:(delta:number,mode:number)=>boolean){
 const wheel=(event:WheelEvent)=>{
  if(event.target!==node||event.defaultPrevented||event.ctrlKey||!Number.isFinite(event.deltaY)||!event.deltaY||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
  if(forward(event.deltaY,event.deltaMode))event.preventDefault();
 };
 node.addEventListener('wheel',wheel,{passive:false});
 return()=>node.removeEventListener('wheel',wheel);
}

export function useHelpWebMarginWheel(pane:RefObject<View|null>,timeline:RefObject<HelpTimelineHandle|null>,enabled:boolean){
 useLayoutEffect(()=>{
  if(Platform.OS!=='web'||!enabled)return;
  const node=pane.current as unknown as HTMLElement|null;
  if(!node?.addEventListener)return;
  return bindHelpMarginWheel(node,(delta,mode)=>timeline.current?.scrollByWheel?.(delta,mode)??false);
 },[pane,timeline,enabled]);
}
