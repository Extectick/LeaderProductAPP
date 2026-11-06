/** Small native thumbnail jobs, never a burst of decodes or React commits. */
export function createHelpPhotoPreviewQueue<T>(discard:(value:T)=>void,limit=2) {
  type Job={active:boolean;load:()=>Promise<T>;ready:(value:T)=>void;result?:{value:T}};
  const jobs=new Set<Job>();
  let paused=true,running=0,timer:ReturnType<typeof setTimeout>|undefined;
  const pending:Job[]=[];
  function schedule(){
    if(paused||timer!==undefined)return;
    timer=setTimeout(()=>{timer=undefined;pump();},16);
  }
  function pump(){
    if(paused)return;
    // Publish at most one completion per frame-sized turn.
    const completed=[...jobs].find(job=>job.result);
    if(completed){
      const value=completed.result!.value;completed.result=undefined;jobs.delete(completed);
      if(completed.active)completed.ready(value);else discard(value);
    }
    while(running<limit&&pending.length){
      const job=pending.shift()!;if(!job.active)continue;
      running++;
      void Promise.resolve().then(job.load).then(value=>{
        if(job.active)job.result={value};else discard(value);
      },()=>{jobs.delete(job);}).finally(()=>{running--;schedule();});
    }
    if([...jobs].some(job=>job.result))schedule();
  }
  return {
    enqueue(load:()=>Promise<T>,ready:(value:T)=>void){
      const job:Job={active:true,load,ready};jobs.add(job);pending.push(job);schedule();
      return()=>{job.active=false;jobs.delete(job);const index=pending.indexOf(job);if(index>=0)pending.splice(index,1);if(job.result){discard(job.result.value);job.result=undefined;}};
    },
    setPaused(value:boolean){paused=value;if(value&&timer!==undefined){clearTimeout(timer);timer=undefined;}else if(!value)schedule();},
    clear(){paused=true;if(timer!==undefined)clearTimeout(timer);timer=undefined;pending.length=0;for(const job of jobs){job.active=false;if(job.result){discard(job.result.value);job.result=undefined;}}jobs.clear();},
  };
}
