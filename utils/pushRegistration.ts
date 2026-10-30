import {AppState,Platform} from 'react-native';
import {syncPushToken,subscribePushTokenChanges} from './pushNotifications';
import {createPushRegistrationLoop} from './pushRegistrationRetry';

/** One authenticated owner, one native rotation listener and one bounded retry loop. */
export function startPushTokenRegistration(userId:number){
  if(Platform.OS==='web'||!Number.isSafeInteger(userId)||userId<=0)return()=>{};
  if(__DEV__)console.info('[push] registration session started');
  let alive=true,mayAskPermission=true,offToken:(()=>void)|undefined;
  const loop=createPushRegistrationLoop(()=>{const askPermission=mayAskPermission;mayAskPermission=false;return syncPushToken(userId,()=>alive,{askPermission});},attempt=>{
    // Never include token values or provider error payloads in logs.
    if(__DEV__)console.warn('[push] registration not completed',{attempt});
  });
  const state=AppState.addEventListener('change',value=>{if(value==='active')loop.trigger('foreground');});
  void subscribePushTokenChanges(()=>loop.trigger('rotation')).then(unsubscribe=>{if(alive)offToken=unsubscribe;else unsubscribe();}).catch(()=>{});
  loop.trigger('initial');
  return()=>{if(!alive)return;alive=false;loop.dispose();state.remove();offToken?.();};
}
