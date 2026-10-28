import { API_BASE_URL } from '@/utils/config';
import type { HelpTicket } from './helpApi';
import { listHistoryRecords, readHistoryMessage, readHistoryMessages, readHistoryRecord, removeHistoryTicket, writeHistoryChange } from './helpHistoryDatabase';
import { validHelpAnchor } from './helpHistoryModel';
import type { HelpCachedWindow, HelpHistoryPage, HelpSyncResult, HelpViewportAnchor } from './helpHistoryTypes';

export const helpHistoryScope = (userId: number) => `${encodeURIComponent(API_BASE_URL)}:${userId}`;
export async function readCachedHelpTickets(userId: number) {
  return (await listHistoryRecords(helpHistoryScope(userId))).map(row => row.ticket);
}
export async function cacheHelpTickets(userId: number, tickets: HelpTicket[]) {
  for (const ticket of tickets) await writeHistoryChange(helpHistoryScope(userId), ticket.id, {ticket});
}
export async function readCachedHelpTicket(userId: number, ticketId: number, sequence?: number): Promise<HelpCachedWindow | null> {
  const scope = helpHistoryScope(userId), record = await readHistoryRecord(scope,ticketId);
  if (!record) return null;
  const target = sequence ?? record.lastSequence;
  const range = record.ranges.find(range => target >= range.from && target <= range.to)
    ?? (!sequence ? record.ranges.at(-1) : undefined);
  if (!range) return {record,page:null};
  let messages;
  if (sequence) {
    const before = await readHistoryMessages(scope,ticketId,range.from,target,40,true);
    const after = await readHistoryMessages(scope,ticketId,target+1,range.to,100-before.length);
    messages = [...before,...after];
  } else messages = await readHistoryMessages(scope,ticketId,range.from,range.to,100,true);
  const first = messages[0]?.sequence, last = messages.at(-1)?.sequence;
  const hasOlder = first !== undefined && (range.hasOlder || first > range.from);
  const hasNewer = last !== undefined && (range.hasNewer || last < record.lastSequence || last < range.to);
  return {record,page:{
    messages,hasOlder,hasNewer,olderCursor:hasOlder ? first! : null,newerCursor:hasNewer ? last! : null,nextCursor:hasOlder ? first! : null,
    lastReadSequence:record.lastReadSequence,firstUnreadSequence:record.firstUnreadSequence,lastSequence:record.lastSequence,
    eventCursor:record.syncCursor,snapshotCursor:record.snapshotCursor,
  }};
}
export async function cacheHelpPage(userId: number, ticket: HelpTicket, page: HelpHistoryPage) {
  await writeHistoryChange(helpHistoryScope(userId), ticket.id, {ticket,page});
}
export async function cacheHelpSync(userId: number, ticketId: number, sync: HelpSyncResult) {
  await writeHistoryChange(helpHistoryScope(userId), ticketId, {sync});
}
export async function readCachedHelpRange(userId:number,ticketId:number,from:number,to:number,limit=100){return readHistoryMessages(helpHistoryScope(userId),ticketId,from,to,limit);}
export async function readCachedHelpMessage(userId:number,ticketId:number,messageId:number){return readHistoryMessage(helpHistoryScope(userId),ticketId,messageId);}
export async function findCachedHelpDate(userId:number,ticketId:number,from:string,to:string):Promise<{complete:boolean;messageId:number|null;sequence:number|null}> {
  const scope=helpHistoryScope(userId),record=await readHistoryRecord(scope,ticketId);
  const missing={complete:false,messageId:null,sequence:null};
  if(!record)return missing;
  const lower=Date.parse(from),upper=Date.parse(to);
  if(!Number.isFinite(lower)||!Number.isFinite(upper)||upper<=lower)return missing;
  // createdAt is not guaranteed monotonic by sequence. Endpoint timestamps cannot prove a day is complete.
  // Only a contiguous, fully downloaded ticket can prove the earliest matching sequence while offline.
  const range=record.ranges.find(range=>!range.hasOlder&&!range.hasNewer&&(range.throughSequence??range.to)>=record.lastSequence);
  if(!range&&record.lastSequence!==0)return missing;
  let found:{messageId:number;sequence:number}|null=null;
  if(range){
    let after=range.from;
    while(after<=range.to){
      const rows=await readHistoryMessages(scope,ticketId,after,range.to,500);
      if(!rows.length)break;
      const target=rows.find(message=>{const at=Date.parse(message.createdAt);return at>=lower&&at<upper;});
      if(target){found={messageId:target.id,sequence:target.sequence};break;}
      const next=rows.at(-1)!.sequence+1;if(next<=after)break;after=next;
    }
  }
  const latest=await readHistoryRecord(scope,ticketId);
  if(!latest||latest.snapshotCursor!==record.snapshotCursor||latest.syncCursor!==record.syncCursor||latest.lastSequence!==record.lastSequence)return missing;
  return {complete:true,messageId:found?.messageId??null,sequence:found?.sequence??null};
}
export async function saveHelpViewport(userId: number, ticketId: number, anchor: HelpViewportAnchor) {
  if (!validHelpAnchor(anchor)) return;
  await writeHistoryChange(helpHistoryScope(userId), ticketId, {anchor});
}
export async function forgetHelpTicket(userId: number, ticketId: number) { await removeHistoryTicket(helpHistoryScope(userId),ticketId); }
