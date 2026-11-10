import React, {createContext,useContext,useEffect,useMemo} from 'react';
import {createHelpApi,type HelpAudioTranscript} from './helpApi';

type TranscriptReader=(attachmentId:string,signal:AbortSignal)=>Promise<HelpAudioTranscript>;
export const HelpAudioTranscriptContext=createContext<TranscriptReader|null>(null);
export const useHelpAudioTranscript=()=>useContext(HelpAudioTranscriptContext);

function waitForPoll(signal:AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    signal.throwIfAborted();
    const abort=()=>{clearTimeout(timer);reject(new Error('Aborted'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},1000);
    signal.addEventListener('abort',abort,{once:true});
  });
}

/** No history requests on mount. The server owns permanent results and single-flight. */
export function HelpAudioTranscriptScope({userId,ticketId,children}:{userId:number|null|undefined;ticketId:number|null;children:React.ReactNode}) {
  const scope=useMemo(()=>({controller:new AbortController(),api:createHelpApi(userId??undefined)}),[userId,ticketId]);
  useEffect(()=>{if(scope.controller.signal.aborted)scope.controller=new AbortController();return()=>scope.controller.abort();},[scope]);
  const read=useMemo<TranscriptReader|null>(()=>userId&&ticketId?async(id,callerSignal)=>{
    const signal=AbortSignal.any([callerSignal,scope.controller.signal,AbortSignal.timeout(180000)]);
    signal.throwIfAborted();
    let result=await scope.api.audioTranscript(id,false,signal);
    if(result.status==='not_started'||result.status==='unavailable')result=await scope.api.audioTranscript(id,true,signal);
    while(result.status==='pending'){
      await waitForPoll(signal);
      result=await scope.api.audioTranscript(id,false,signal);
    }
    signal.throwIfAborted();
    if(result.attachmentId!==id)throw new Error('Transcript identity mismatch');
    return result;
  }:null,[scope,userId,ticketId]);
  return <HelpAudioTranscriptContext.Provider value={read}>{children}</HelpAudioTranscriptContext.Provider>;
}
