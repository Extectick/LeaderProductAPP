import type {HelpMessage} from './helpApi';
/** A progress placeholder can become the final answer at the same sequence later. */
export function readableHelpSequence(messages:HelpMessage[],requested:number){
  let sequence=0;
  for(const message of messages)if(message.sequence<=requested&&message.kind!=='ASSISTANT_PROGRESS'&&!['thinking','streaming'].includes(message.assistantRun?.status??''))sequence=Math.max(sequence,message.sequence);
  return sequence;
}
