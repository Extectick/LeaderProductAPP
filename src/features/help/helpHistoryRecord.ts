import type { HelpTicket } from './helpApi';
import { mergeHelpRanges } from './helpHistoryModel';
import type { HelpHistoryPage, HelpHistoryRecord, HelpSyncResult, HelpViewportAnchor } from './helpHistoryTypes';

export type HelpHistoryChange = { ticket?: HelpTicket; page?: HelpHistoryPage; sync?: HelpSyncResult; anchor?: HelpViewportAnchor };
export function updateHelpHistoryRecord(previous: HelpHistoryRecord | null, change: HelpHistoryChange): HelpHistoryRecord | null {
  const ticket = change.sync?.ticket ?? change.ticket ?? previous?.ticket;
  if (!ticket) return null;
  const snapshot = change.sync ?? change.page;
  const version = snapshot?.snapshotCursor ?? (change.sync ? change.sync.eventCursor : change.page?.eventCursor) ?? 0;
  const current = !previous || version >= previous.snapshotCursor;
  const metadataIsNewer=!previous||Date.parse(ticket.updatedAt)>Date.parse(previous.ticket.updatedAt)
    ||(ticket.lastSequence??ticket.lastMessage?.sequence??0)>(previous?.lastSequence??0);
  const acceptedTicket=current&&snapshot?ticket:(!previous||(!snapshot&&metadataIsNewer)?ticket:previous.ticket);
  const lastReadSequence=Math.max(previous?.lastReadSequence??0,snapshot?.lastReadSequence??ticket.lastReadSequence??0);
  const mergedTicket={...acceptedTicket,lastReadSequence,
    ...(previous&&(ticket.lastReadSequence??0)<previous.lastReadSequence?{unreadCount:previous.ticket.unreadCount}:{}),
  };
  return {
    ticket: mergedTicket,
    ranges: change.page ? mergeHelpRanges(previous?.ranges ?? [], change.page) : previous?.ranges ?? [],
    anchor: change.anchor ?? previous?.anchor ?? null,
    // A page is only a snapshot of one window. It must not acknowledge unseen edits elsewhere.
    syncCursor: change.sync ? Math.max(previous?.syncCursor ?? 0, change.sync.nextCursor)
      : previous?.ranges.length ? previous.syncCursor : Math.max(previous?.syncCursor ?? 0,change.page?.eventCursor ?? 0),
    snapshotCursor: Math.max(previous?.snapshotCursor ?? 0, version),
    lastReadSequence,
    firstUnreadSequence: current && snapshot ? snapshot.firstUnreadSequence : previous?.firstUnreadSequence ?? null,
    lastSequence: Math.max(previous?.lastSequence ?? 0, snapshot?.lastSequence ?? ticket.lastSequence ?? ticket.lastMessage?.sequence ?? 0),
    updatedAt: Date.now(),
  };
}
