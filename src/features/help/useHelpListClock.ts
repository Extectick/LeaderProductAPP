import {useEffect,useState} from 'react';
import {AppState} from 'react-native';

/** One clock for the visible ticket list. No row timers or chat-stream updates.
 * Recompute after foreground/timezone changes and across the overnight cutoff. */
export function useHelpListClock(enabled:boolean):number {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    if(!enabled)return;
    let timer:ReturnType<typeof setInterval>|undefined;
    const stop=()=>{if(timer!==undefined){clearInterval(timer);timer=undefined;}};
    const resume=()=>{stop();setNow(Date.now());timer=setInterval(()=>setNow(Date.now()),60000);};
    if(AppState.currentState!=='background'&&AppState.currentState!=='inactive')resume();
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')resume();else stop();});
    return()=>{stop();subscription.remove();};
  },[enabled]);
  return now;
}
