import {Platform} from 'react-native';
import {API_BASE_URL} from './config';

/** Browser tabs share storage, but a localStorage read/write is not a mutex. */
export async function withAuthWebLock<T>(kind:'refresh'|'credentials',work:()=>Promise<T>):Promise<T> {
  const locks=Platform.OS==='web'&&typeof navigator!=='undefined'?navigator.locks:undefined;
  if(!locks?.request)return work();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15_000);
  try {
    return await locks.request(`leader-auth:${API_BASE_URL}:${kind}`,{mode:'exclusive',signal:controller.signal},()=>{
      clearTimeout(timer);
      return work();
    });
  }finally{clearTimeout(timer);}
}
