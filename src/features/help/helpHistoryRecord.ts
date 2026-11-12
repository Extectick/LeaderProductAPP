import type { HelpTicket } from './helpApi';
import { mergeHelpRanges } from './helpHistoryModel';
import {mergeHelpReadState} from './helpReadSequence';
import type { HelpHistoryPage, HelpHistoryRecord, HelpSyncResult, HelpViewportAnchor } from './helpHistoryTypes';

export type HelpReadReceipt={sequence:number;unreadCount?:number;lastSequence:number;snapshotCursor:number};
export type HelpHistoryChange = { ticket?: HelpTicket; page?: HelpHistoryPage; sync?: HelpSyncResult; anchor?: HelpViewportAnchor; readReceipt?:HelpReadReceipt };
export function updateHelpHistoryRecord(previous: HelpHistoryRecord | null, change: HelpHistoryChange): HelpHistoryRecord | null {
  const ticket = change.sync?.ticket ?? change.ticket ?? previous?.ticket;
  if (!ticket) return null;
  const snapshot = change.sync ?? change.page;
  const version = snapshot?.snapshotCursor ?? (change.sync ? change.sync.eventCursor : change.page?.eventCursor) ?? 0;
  const current = !previous || version >= previous.snapshotCursor;
  const metadataIsNewer=!previous||Date.parse(ticket.updatedAt)>Date.parse(previous.ticket.updatedAt)
    ||(ticket.lastSequence??ticket.lastMessage?.sequence??0)>(previous?.lastSequence??0);
  const acceptedTicket=current&&snapshot?ticket:(!previous||(!snapshot&&metadataIsNewer)?ticket:previous.ticket);
  const receipt=change.readReceipt;
  const lastReadSequence=Math.max(previous?.lastReadSequence??0,snapshot?.lastReadSequence??ticket.lastReadSequence??0,receipt?.sequence??0);
  const lastSequence=Math.max(previous?.lastSequence??0,snapshot?.lastSequence??ticket.lastSequence??ticket.lastMessage?.sequence??0);
  let mergedTicket={...mergeHelpReadState(mergeHelpReadState(acceptedTicket,ticket),previous?.ticket),lastReadSequence};
  // A receipt never replaces ticket metadata, cached messages or replay cursors.
  // A partial count is valid only for the exact content window we inspected.
  if(receipt&&receipt.sequence>=(previous?.lastReadSequence??0)
      &&receipt.snapshotCursor>=(previous?.snapshotCursor??0)&&receipt.lastSequence>=lastSequence
      &&receipt.unreadCount!==undefined)mergedTicket={...mergedTicket,unreadCount:receipt.unreadCount};
  if(lastSequence<=lastReadSequence)mergedTicket={...mergedTicket,unreadCount:0};
  const firstUnreadSequence=current&&snapshot?snapshot.firstUnreadSequence:previous?.firstUnreadSequence??null;
  let ranges=change.page ? mergeHelpRanges(previous?.ranges ?? [],change.page) : previous?.ranges ?? [];
  // A delta proves only the returned individual message positions, never a disjoint span.
  if(change.sync)for(const message of change.sync.messages){if(ranges.some(range=>message.sequence>=range.from&&message.sequence<=range.to))continue;
    ranges=mergeHelpRanges(ranges,{messages:[message],nextCursor:null,olderCursor:null,newerCursor:null,hasOlder:message.sequence>1,hasNewer:message.sequence<change.sync.lastSequence,lastReadSequence,lastSequence:change.sync.lastSequence,firstUnreadSequence:change.sync.firstUnreadSequence,eventCursor:change.sync.eventCursor});
  }
  return {
    ticket: mergedTicket,
    ranges,
    anchor: change.anchor ?? previous?.anchor ?? null,
    // A page is only a snapshot of one window. It must not acknowledge unseen edits elsewhere.
    syncCursor: change.sync ? Math.max(previous?.syncCursor ?? 0, change.sync.nextCursor)
      : previous?.ranges.length ? previous.syncCursor : Math.max(previous?.syncCursor ?? 0,change.page?.eventCursor ?? 0),
    snapshotCursor: Math.max(previous?.snapshotCursor ?? 0, version),
    lastReadSequence,
    firstUnreadSequence:firstUnreadSequence!==null&&firstUnreadSequence>lastReadSequence?firstUnreadSequence:null,
    lastSequence,
    updatedAt: Date.now(),
  };
}
