import {helpPendingMessage} from './helpPendingPresentation';
import type { HelpMessage } from './helpApi';
import type { HelpPending } from './helpDurableTypes';
import type {HelpNavigationTarget} from './helpHistoryTypes';
import { helpDayKey } from './helpUiUtils';
import {helpHtmlAttachmentId} from './helpHtml';
import type {HelpQuestionExchange,HelpPendingQuestionExchange} from './helpQuestionHistory';

export type HelpMessageGroup = { groupFirst: boolean; groupLast: boolean };
const HELP_MESSAGE_GROUP_INTERVAL = 5 * 60 * 1000;

/** A visible separator or a change of sender always starts a new message group. */
export function helpMessagesCanGroup(previous: HelpMessage | undefined, next: HelpMessage | undefined, firstUnreadSequence?: number | null): boolean {
  if (!previous || !next || previous.kind !== 'TEXT' || next.kind !== 'TEXT'
    || previous.authorId == null || previous.authorId !== next.authorId || previous.ticketId !== next.ticketId
    || next.sequence === firstUnreadSequence || next.ticketStatusChange) return false;
  const from = new Date(previous.createdAt), to = new Date(next.createdAt);
  const elapsed = to.getTime() - from.getTime();
  return elapsed >= 0 && elapsed <= HELP_MESSAGE_GROUP_INTERVAL
    && from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth() && from.getDate() === to.getDate();
}

/** Calculate against the loaded window, so prepending/appending history also repairs its group edges. */
export function helpMessageGroups(messages: readonly HelpMessage[], firstUnreadSequence?: number | null): Map<number, HelpMessageGroup> {
  return new Map(messages.map((message, index) => [message.id, {
    groupFirst: !helpMessagesCanGroup(messages[index - 1], message, firstUnreadSequence),
    groupLast: !helpMessagesCanGroup(message, messages[index + 1], firstUnreadSequence),
  }]));
}

export type HelpTimelineRow = { key:string; kind:'message'|'pending'|'date'|'unread'; message: HelpMessage; questionAnswer?:HelpMessage; questionPending?:HelpPending; pending?:HelpPending; date?: string; unread: boolean };
/** Reuse HTML surfaces among HTML rows, without replacing them with ordinary
 * text cells while scrolling. One shared pool stays bounded by visible demand. */
export function helpTimelineRowType(row:HelpTimelineRow):string {
  if(row.kind==='message'&&row.message.attachments?.some(file=>helpHtmlAttachmentId(file)!==null))return 'message-html';
  return row.kind==='pending'?'message':row.kind;
}
/** Presentation only: pending entries never enter history/read persistence. */
export function helpTimelineEntries(messages:HelpMessage[],pending:readonly HelpPending[]=[],authorId:number|null=null) {
  const accepted=new Set(messages.flatMap(message=>message.clientMessageId?[message.clientMessageId]:[]));
  const entries:{message:HelpMessage;pending?:HelpPending}[]=messages.map(message=>({message}));
  for(const item of pending){
    const clientMessageId=item.input.clientMessageId||item.key;
    if(accepted.has(clientMessageId))continue;
    accepted.add(clientMessageId);
    entries.push({pending:item,message:{id:-(entries.length+1),ticketId:item.ticketId??0,sequence:0,clientMessageId,authorId,author:null,authorRole:'USER',kind:item.action==='close'?'CLOSURE':'TEXT',text:item.input.text,createdAt:new Date(item.createdAt).toISOString(),editedAt:null,replyToId:item.input.replyToId??null,replyTo:item.replyTo??null,forwardedFromId:null,rating:null,attachments:helpPendingMessage(item,authorId??0).attachments,reactions:[]}});
  }
  return entries;
}
/** Last committed sequence represented by this cell, including a grouped reply. */
export function helpTimelineRowSequence(row:HelpTimelineRow):number {
  return row.questionAnswer?.sequence??row.message.sequence;
}

/** Both source messages remain independently addressable in search/replies and
 * persisted anchors even when they share one measured cell. */
export function helpTimelineRowMatches(row:HelpTimelineRow,target:Pick<HelpNavigationTarget,'messageId'|'sequence'>):boolean {
  return row.message.id===target.messageId||row.message.sequence===target.sequence
    ||Boolean(row.questionAnswer&&(row.questionAnswer.id===target.messageId||row.questionAnswer.sequence===target.sequence));
}

export function helpTimelineRows(messages: HelpMessage[], firstUnreadSequence?: number | null, pending:readonly HelpPending[]=[],questionExchanges?:ReadonlyMap<number,HelpQuestionExchange>,pendingQuestionExchanges?:ReadonlyMap<number,HelpPendingQuestionExchange>): HelpTimelineRow[] {
  const rows:HelpTimelineRow[]=[],entries=helpTimelineEntries(messages,pending),consumed=new Set<number>(),consumedPending=new Set<string>();
  const pendingByKey=new Map(entries.flatMap(entry=>entry.pending?[[entry.pending.key,entry.pending] as const]:[]));
  let previousDay:string|undefined;
  entries.forEach(({message,pending},index)=>{
    if(pending?consumedPending.has(pending.key):consumed.has(message.id))return;
    const exchange=!pending?questionExchanges?.get(message.id):undefined,next=entries[index+1];
    // Fold only an actually loaded adjacent pair. A stale map or a window that
    // starts at the answer must never drop the standalone answer.
    const questionAnswer=exchange&&next&&!next.pending&&next.message===exchange.message
      &&next.message.ticketId===message.ticketId&&next.message.sequence===message.sequence+1?next.message:undefined;
    if(questionAnswer)consumed.add(questionAnswer.id);
    const pendingExchange=!pending&&!questionAnswer?pendingQuestionExchanges?.get(message.id):undefined;
    const pendingItem=pendingExchange?pendingByKey.get(pendingExchange.pending.key):undefined;
    const questionPending=pendingItem&&pendingItem===pendingExchange?.pending&&pendingItem.ticketId===message.ticketId&&pendingItem.input.replyToId===message.id?pendingItem:undefined;
    if(questionPending)consumedPending.add(questionPending.key);
    const day=helpDayKey(message.createdAt);
    const identity=message.clientMessageId?`client:${message.clientMessageId}`:`message:${message.id}`;
    if(previousDay!==day)rows.push({key:`date:${day}:${identity}`,kind:'date',message,date:message.createdAt,unread:false});
    previousDay=day;
    const unreadMessage=message.sequence===firstUnreadSequence?message:questionAnswer?.sequence===firstUnreadSequence?questionAnswer:undefined;
    if(!pending&&unreadMessage)rows.push({key:`unread:${unreadMessage.sequence}`,kind:'unread',message:unreadMessage,unread:true});
    rows.push({key:identity,kind:pending?'pending':'message',message,questionAnswer,questionPending,pending,unread:false});
  });
  return rows;
}

/** A saved anchor can be deleted or hidden (for example a superseded assistant
 * placeholder). Restore the nearest visible message instead of waiting forever. */
export function helpNavigationIndex(rows:HelpTimelineRow[],target:HelpNavigationTarget):number {
  if(target.kind==='latest')return rows.length-1;
  const exact=rows.findIndex(row=>(target.kind==='unread'?row.kind==='unread':row.kind==='message')&&helpTimelineRowMatches(row,target));
  if(exact>=0)return exact;
  const messages=rows.map((row,index)=>({row,index})).filter(item=>item.row.kind==='message');
  return (target.sequence===undefined?messages[0]:messages.find(item=>helpTimelineRowSequence(item.row)>=target.sequence!)??messages.at(-1))?.index??-1;
}

/** Ignore cells hidden beneath the floating header/composer, including recycled estimates. */
export function helpVisibleRows<T extends { top: number; height: number }>(rows: T[], top: number, bottom: number) {
  return rows.filter(row => Math.min(row.top + row.height, bottom) - Math.max(row.top, top) >= Math.min(32, row.height));
}

export function helpIsAtLatest(contentHeight: number, offset: number, viewport: number, bottomInset: number, hasNewer: boolean) {
  return !hasNewer && contentHeight + bottomInset - offset - viewport <= 64;
}
