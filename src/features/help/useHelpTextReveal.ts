import {useContext,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {AccessibilityInfo,AppState,Platform} from 'react-native';
import {useHelpReducedMotion} from './helpTheme';
import {HelpVisualEffectsContext} from './helpVisualEffects';
import {createHelpTextReveal,updateHelpTextReveal,stepHelpTextReveal,HELP_TEXT_FRAME_MS} from './helpTextReveal';

// One clock and native preference subscription for all currently revealing text.
const ticks=new Set<(now:number)=>void>();let timer:ReturnType<typeof setTimeout>|undefined;
function schedule(){if(timer!==undefined||!ticks.size)return;timer=setTimeout(()=>{timer=undefined;const now=Date.now();for(const tick of [...ticks])if(ticks.has(tick))tick(now);schedule();},HELP_TEXT_FRAME_MS);}
function subscribeTick(tick:(now:number)=>void){ticks.add(tick);schedule();return()=>{ticks.delete(tick);if(!ticks.size&&timer!==undefined){clearTimeout(timer);timer=undefined;}};}
const preferences=new Set<()=>void>();let reader=false,generation=0,readerRevision=0;
const foreground=()=>AppState.currentState==='active'&&(Platform.OS!=='web'||typeof document==='undefined'||document.visibilityState!=='hidden');
const preferenceSnapshot=()=>foreground()&&!reader;
function subscribePreferences(listener:()=>void){
 preferences.add(listener);
 if(preferences.size===1){
  const current=++generation,revision=readerRevision;
  preferenceCleanup=()=>{app.remove();screenReader.remove();if(Platform.OS==='web'&&typeof document!=='undefined')document.removeEventListener('visibilitychange',publish);};
  const publish=()=>preferences.forEach(notify=>notify());
  const app=AppState.addEventListener('change',publish);
  const screenReader=AccessibilityInfo.addEventListener('screenReaderChanged',value=>{readerRevision++;reader=value;publish();});
  if(Platform.OS==='web'&&typeof document!=='undefined')document.addEventListener('visibilitychange',publish);
  void Promise.resolve(AccessibilityInfo.isScreenReaderEnabled()).then(value=>{if(current===generation&&revision===readerRevision){reader=value;publish();}}).catch(()=>{});
 }
 return()=>{preferences.delete(listener);if(!preferences.size){generation++;preferenceCleanup?.();preferenceCleanup=undefined;}};
}
let preferenceCleanup:(()=>void)|undefined;

export function useHelpTextReveal({identity,text,active,completed=false}:{identity:string;text:string;active:boolean;completed?:boolean}){
 const focused=useContext(HelpVisualEffectsContext),reduced=useHelpReducedMotion();
 const foregroundMotion=useSyncExternalStore(subscribePreferences,preferenceSnapshot,()=>false),enabled=focused&&!reduced&&foregroundMotion;
 const model=useRef<ReturnType<typeof createHelpTextReveal>|null>(null);
 if(!model.current)model.current=createHelpTextReveal(identity,text,active,Date.now());
 const [frame,setFrame]=useState(()=>({identity,offset:text.length}));
 const subscription=useRef<(()=>void)|null>(null);
 const stop=()=>{subscription.current?.();subscription.current=null;};
 useLayoutEffect(()=>{
  const next=updateHelpTextReveal(model.current!,identity,text,active,completed,enabled,Date.now());model.current=next;
  setFrame(old=>old.identity===identity&&old.offset===next.offset?old:{identity,offset:next.offset});
  if(next.offset>=next.source.length){stop();return;}
  if(!subscription.current)subscription.current=subscribeTick(now=>{
   const next=stepHelpTextReveal(model.current!,now);model.current=next;
   setFrame(old=>old.identity===next.identity&&old.offset===next.offset?old:{identity:next.identity,offset:next.offset});
   if(next.offset>=next.source.length)stop();
  });
 },[identity,text,active,completed,enabled]);
 useLayoutEffect(()=>stop,[]);
 // Identity changes, corrections, errors and reduced-motion/background never
 // paint an old prefix while waiting for the layout effect.
 const immediate=frame.identity!==identity||!enabled||!text.startsWith(model.current.source)||!active&&!completed;
 return immediate?text:text.slice(0,Math.min(frame.offset,text.length));
}
