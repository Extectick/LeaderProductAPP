import {Platform} from 'react-native';
import {withAuthWebLock} from '../utils/authWebLock';
jest.mock('../utils/config',()=>({API_BASE_URL:'https://auth-lock.example.test'}));
const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
afterEach(()=>{if(original)Object.defineProperty(globalThis,'navigator',original);else Reflect.deleteProperty(globalThis,'navigator');jest.useRealTimers();});

test('native and older browsers execute without a browser lock API',async()=>{
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
  for(const platform of ['android','web'] as const){jest.replaceProperty(Platform,'OS',platform);const work=jest.fn(async()=>42);expect(await withAuthWebLock('refresh',work)).toBe(42);expect(work).toHaveBeenCalledTimes(1);}
});

test('a queued browser lock times out without starting the protected operation',async()=>{
  jest.useFakeTimers();jest.replaceProperty(Platform,'OS','web');
  const request=jest.fn((_name:string,{signal}:{signal:AbortSignal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{const error=new Error('aborted');error.name='AbortError';reject(error);})));
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request}}});
  const work=jest.fn(async()=>42),pending=withAuthWebLock('refresh',work);
  const result=expect(pending).rejects.toMatchObject({name:'AbortError'});
  await jest.advanceTimersByTimeAsync(15000);await result;
  expect(work).not.toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0);
});

test('once acquired, the deadline does not abort an active credential write',async()=>{
  jest.useFakeTimers();jest.replaceProperty(Platform,'OS','web');
  let held:AbortSignal|undefined,finish!:()=>void;
  const request=jest.fn((_name:string,{signal}:{signal:AbortSignal},work:()=>Promise<void>)=>{held=signal;return work();});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request}}});
  const pending=withAuthWebLock('credentials',()=>new Promise<void>(resolve=>{finish=resolve;}));
  await jest.advanceTimersByTimeAsync(16000);expect(held?.aborted).toBe(false);
  finish();await pending;expect(jest.getTimerCount()).toBe(0);
});
