import {createPushRegistrationLoop} from '../utils/pushRegistrationRetry';
async function settle(){for(let i=0;i<10;i++)await Promise.resolve();}
beforeEach(()=>jest.useFakeTimers());
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();});
test('transient failure has a bounded retry budget and a later foreground wakeup starts a new budget',async()=>{
 const sync=jest.fn(async()=>{throw new Error('temporary');}),loop=createPushRegistrationLoop(sync);
 try{loop.trigger();await settle();for(const delay of [2000,10000,30000,120000]){jest.advanceTimersByTime(delay);await settle();}expect(sync).toHaveBeenCalledTimes(5);jest.advanceTimersByTime(1000000);await settle();expect(sync).toHaveBeenCalledTimes(5);loop.trigger('foreground');await settle();expect(sync).toHaveBeenCalledTimes(6);}finally{loop.dispose();}
});
test('rotation while syncing coalesces into one follow-up and disposal cancels timers',async()=>{
 let resolve!:(value:unknown)=>void;const sync=jest.fn(()=>new Promise(done=>{resolve=done;})),loop=createPushRegistrationLoop(sync);
 loop.trigger();loop.trigger('rotation');loop.trigger('rotation');expect(sync).toHaveBeenCalledTimes(1);resolve('first');await settle();expect(sync).toHaveBeenCalledTimes(2);loop.dispose();resolve('second');await settle();jest.advanceTimersByTime(500000);expect(sync).toHaveBeenCalledTimes(2);
});
test('permanent failure does not retry and a late rejected promise cannot schedule after cleanup',async()=>{
 const permanent=jest.fn(async()=>{throw {retryable:false};}),first=createPushRegistrationLoop(permanent);first.trigger();await settle();jest.advanceTimersByTime(500000);expect(permanent).toHaveBeenCalledTimes(1);first.dispose();
 let reject!:(error:Error)=>void;const sync=jest.fn(()=>new Promise((_,fail)=>{reject=fail;})),second=createPushRegistrationLoop(sync);second.trigger();second.dispose();reject(new Error('late'));await settle();jest.advanceTimersByTime(500000);expect(sync).toHaveBeenCalledTimes(1);
});
