import type { HelpMessage } from './helpApi';
import type {HelpNavigationTarget} from './helpHistoryTypes';
import { helpDayKey } from './helpUiUtils';

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

export type HelpTimelineRow = { key:string; kind:'message'|'date'|'unread'; message: HelpMessage; date?: string; unread: boolean };
export function helpTimelineRows(messages: HelpMessage[], firstUnreadSequence?: number | null): HelpTimelineRow[] {
  const rows:HelpTimelineRow[]=[];
  messages.forEach((message,index)=>{
    const day=helpDayKey(message.createdAt);
    if(!index || helpDayKey(messages[index-1].createdAt)!==day)rows.push({key:`date:${day}:${message.id}`,kind:'date',message,date:message.createdAt,unread:false});
    if(message.sequence===firstUnreadSequence)rows.push({key:`unread:${message.sequence}`,kind:'unread',message,unread:true});
    rows.push({key:`message:${message.id}`,kind:'message',message,unread:false});
  });
  return rows;
}

/** A saved anchor can be deleted or hidden (for example a superseded assistant
 * placeholder). Restore the nearest visible message instead of waiting forever. */
export function helpNavigationIndex(rows:HelpTimelineRow[],target:HelpNavigationTarget):number {
  if(target.kind==='latest')return rows.length-1;
  const exact=rows.findIndex(row=>(target.kind==='unread'?row.kind==='unread':row.kind==='message')&&(row.message.id===target.messageId||row.message.sequence===target.sequence));
  if(exact>=0)return exact;
  const messages=rows.map((row,index)=>({row,index})).filter(item=>item.row.kind==='message');
  return (target.sequence===undefined?messages[0]:messages.find(item=>item.row.message.sequence>=target.sequence!)??messages.at(-1))?.index??-1;
}

/** Ignore cells hidden beneath the floating header/composer, including recycled estimates. */
export function helpVisibleRows<T extends { top: number; height: number }>(rows: T[], top: number, bottom: number) {
  return rows.filter(row => Math.min(row.top + row.height, bottom) - Math.max(row.top, top) >= Math.min(32, row.height));
}

export function helpIsAtLatest(contentHeight: number, offset: number, viewport: number, bottomInset: number, hasNewer: boolean) {
  return !hasNewer && contentHeight + bottomInset - offset - viewport <= 64;
}
