import {createHelpPhotoPreviewQueue} from '../src/features/help/helpPhotoPreviewQueue';
const deferred=()=>{let resolve!:(value:string)=>void;return{promise:new Promise<string>(done=>{resolve=done;}),resolve:(value:string)=>resolve(value)};};
beforeEach(()=>jest.useFakeTimers());
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();});

test('thumbnail decoding is bounded to two jobs and completions yield between publications',async()=>{
 const queue=createHelpPhotoPreviewQueue<string>(jest.fn()),work=Array.from({length:4},deferred),ready=jest.fn(),load=jest.fn();
 work.forEach((job,index)=>queue.enqueue(()=>{load(index);return job.promise;},ready));
 await jest.advanceTimersByTimeAsync(100);expect(load).not.toHaveBeenCalled();
 queue.setPaused(false);await jest.advanceTimersByTimeAsync(16);expect(load).toHaveBeenCalledTimes(2);
 work[0].resolve('a');work[1].resolve('b');await jest.advanceTimersByTimeAsync(16);
 expect(ready).toHaveBeenCalledTimes(1);expect(load).toHaveBeenCalledTimes(4);
 await jest.advanceTimersByTimeAsync(16);expect(ready).toHaveBeenCalledTimes(2);queue.clear();
});
test('scroll pause holds in-flight results and starts no new decodes',async()=>{
 const queue=createHelpPhotoPreviewQueue<string>(jest.fn()),work=deferred(),ready=jest.fn(),next=jest.fn(async()=>'next');
 queue.enqueue(()=>work.promise,ready);queue.setPaused(false);await jest.advanceTimersByTimeAsync(16);
 queue.setPaused(true);queue.enqueue(next,ready);work.resolve('ready');await jest.advanceTimersByTimeAsync(500);
 expect(ready).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();
 queue.setPaused(false);await jest.advanceTimersByTimeAsync(16);expect(ready).toHaveBeenCalledWith('ready');queue.clear();
});
test('offscreen and closed tiles discard late native images without publishing stale pixels',async()=>{
 const discard=jest.fn(),queue=createHelpPhotoPreviewQueue<string>(discard),work=deferred(),ready=jest.fn(),queued=jest.fn(async()=>'queued');
 const cancel=queue.enqueue(()=>work.promise,ready);queue.setPaused(false);await jest.advanceTimersByTimeAsync(16);
 queue.setPaused(true);const cancelQueued=queue.enqueue(queued,ready);cancelQueued();cancel();work.resolve('old');
 await jest.advanceTimersByTimeAsync(100);expect(discard).toHaveBeenCalledWith('old');expect(ready).not.toHaveBeenCalled();
 const late=deferred();queue.enqueue(()=>late.promise,ready);queue.setPaused(false);await jest.advanceTimersByTimeAsync(16);
 queue.clear();late.resolve('closed');await jest.advanceTimersByTimeAsync(100);
 expect(discard).toHaveBeenCalledWith('closed');expect(ready).not.toHaveBeenCalled();expect(queued).not.toHaveBeenCalled();
});
test('closing a paused queue releases a completed image only once when the tile also unmounts',async()=>{
 const discard=jest.fn(),queue=createHelpPhotoPreviewQueue<string>(discard),work=deferred(),ready=jest.fn();
 const cancel=queue.enqueue(()=>work.promise,ready);queue.setPaused(false);await jest.advanceTimersByTimeAsync(16);
 queue.setPaused(true);work.resolve('decoded');await jest.advanceTimersByTimeAsync(50);
 queue.clear();cancel();expect(discard).toHaveBeenCalledTimes(1);expect(ready).not.toHaveBeenCalled();
});
