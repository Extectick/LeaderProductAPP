import type { HelpMessage, HelpTicket } from './helpApi';

export type HelpViewportAnchor = { messageId: number; sequence: number; offset: number; atLatest: boolean };
export type HelpNavigationTarget = {
  key: number; kind: 'latest' | 'anchor' | 'unread' | 'message' | 'date';
  sequence?: number; messageId?: number; offset?: number; animate?: boolean;
};
export type HelpHistoryPage = {
  messages: HelpMessage[]; nextCursor: number | null; olderCursor: number | null; newerCursor: number | null;
  hasOlder: boolean; hasNewer: boolean; lastReadSequence: number; firstUnreadSequence: number | null;
  lastSequence: number; eventCursor: number; snapshotCursor?: number;
};
export type HelpHistoryQuery = { before?: number; after?: number; around?: number; aroundMessageId?: number; limit?: number };
export type HelpSearchResult = { messages: HelpMessage[]; total: number; nextCursor: number | null; snapshotCursor?: number };
export type HelpEvent = { id: number; ticketId: number; type: string; actorId: number | null; messageId: number | null; createdAt: string };
export type HelpSyncResult = {
  ticket: HelpTicket; events: HelpEvent[]; messages: HelpMessage[]; deletedMessageIds: number[];
  nextCursor: number; eventCursor: number; snapshotCursor?: number; hasMore: boolean;
  lastReadSequence: number; firstUnreadSequence: number | null; lastSequence: number;
};
export type HelpHistoryRange = { from: number; to: number; hasOlder: boolean; hasNewer: boolean; throughSequence?: number };
export type HelpHistoryRecord = {
  ticket: HelpTicket; ranges: HelpHistoryRange[]; anchor: HelpViewportAnchor | null;
  syncCursor: number; snapshotCursor: number; lastReadSequence: number; firstUnreadSequence: number | null;
  lastSequence: number; updatedAt: number;
};
export type HelpCachedWindow = { record: HelpHistoryRecord; page: HelpHistoryPage | null };
