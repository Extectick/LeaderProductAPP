/** Bounded registration retry; explicit wakeups reset a completed retry budget. */
const RETRY_DELAYS=[2000,10000,30000,120000] as const;
export function createPushRegistrationLoop(sync:()=>Promise<unknown>,onFailure:(attempt:number)=>void=()=>{}){
  let alive=true,running=false,again=false,attempt=0,timer:ReturnType<typeof setTimeout>|null=null,lastStarted=-Infinity;
  const clear=()=>{if(timer)clearTimeout(timer);timer=null;};
  async function run(){
    if(!alive||running)return;
    running=true;lastStarted=Date.now();
    try{await sync();attempt=0;}
    catch(error){
      if(!alive)return;
      onFailure(attempt+1);
      if((error as {retryable?:boolean})?.retryable!==false&&attempt<RETRY_DELAYS.length){const delay=RETRY_DELAYS[attempt++];timer=setTimeout(()=>{timer=null;void run();},delay);}
    }finally{running=false;if(alive&&again){again=false;clear();attempt=0;void run();}}
  }
  return {trigger:(reason:'initial'|'foreground'|'rotation'='initial')=>{
    if(!alive)return;
    if(reason==='foreground'&&Date.now()-lastStarted<10000)return;
    clear();attempt=0;
    if(running){again=true;return;}
    void run();
  },dispose:()=>{alive=false;again=false;clear();}};
}
