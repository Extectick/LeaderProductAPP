import {useEffect} from 'react';
import {helpDevActions,helpDevState} from '../../src/features/help/helpDiagnostics';
import {putOutbox,readOutbox,readAccountValue,writeAccountValue,writeAccountChanges,readHistorySnapshot} from '../../src/features/help/helpHistoryDatabase';
import type {HelpMessage,HelpTicket} from '../../src/features/help/helpApi';
const scope='qa:help-durable-native:v1',operation='qa-native-operation',ticketId=900000001;
/** Isolated on-device SQL probe: synthetic data, no account/network/provider. */
export function DurableHelpProbe(){
 useEffect(()=>helpDevActions('qa.durable',{'fixture.sqlite':async value=>{
  if(value==='prepare'){
   await putOutbox(scope,{key:operation,ticketId,create:false,input:{text:'Synthetic QA message',clientMessageId:operation},createdAt:Date.now(),status:'queued'});
   await writeAccountValue(scope,'draft:qa','Synthetic QA draft');
  }else if(value==='commit'){
   const message={id:900000001,ticketId,sequence:1,text:'Synthetic confirmed answer',authorId:0,attachments:[],reactions:[],createdAt:new Date().toISOString()} as unknown as HelpMessage;
   const ticket={id:ticketId,number:ticketId,title:'QA durable',status:'OPEN',ownerId:0,members:[],unreadCount:1,lastMessage:message,updatedAt:message.createdAt} as unknown as HelpTicket;
   await writeAccountChanges(scope,[{ticketId,change:{ticket,page:{messages:[message],hasOlder:false,hasNewer:false,nextCursor:null,olderCursor:null,newerCursor:null,lastReadSequence:0,firstUnreadSequence:1,lastSequence:1,eventCursor:7,snapshotCursor:7}}}],7,operation);
  }
  const pending=await readOutbox(scope),snapshot=await readHistorySnapshot(scope,ticketId),cursor=await readAccountValue(scope,'events'),draft=await readAccountValue(scope,'draft:qa');
  helpDevState({durableProbePending:pending.length,durableProbeMessages:snapshot?.messages.length??0,durableProbeCursor:Number(cursor)||0,durableProbeDraft:Boolean(draft),durableProbeNative:true});
 }}),[]);
 return null;
}
