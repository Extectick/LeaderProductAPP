/** Isolated fixture probe for the real history store. Never imported by a production entry. */
import { Platform } from 'react-native';
import { cacheHelpPage, cacheHelpSync, forgetHelpTicket, readCachedHelpMessage, readCachedHelpTicket, saveHelpViewport } from '../../src/features/help/helpHistory';
import { helpDevActions, helpDevProbe, helpDevState } from '../../src/features/help/helpDiagnostics';
import type { HelpMessage, HelpTicket } from '../../src/features/help/helpApi';
import type { HelpHistoryPage, HelpSyncResult } from '../../src/features/help/helpHistoryTypes';

// Neither number can collide with a server-created account or ticket. Callers cannot override them.
export const CACHE_PROBE_USER_ID = -810042;
export const CACHE_PROBE_TICKET_ID = -810043;
const messageId = (sequence: number) => 810043000 + sequence;
const stamp = '2026-10-28T00:00:00.000Z';
function message(sequence: number, edited = false): HelpMessage {
  return { id: messageId(sequence), ticketId: CACHE_PROBE_TICKET_ID, sequence, clientMessageId: null,
    authorId: CACHE_PROBE_USER_ID, author: null, authorRole: 'SYSTEM', kind: 'SYSTEM',
    text: edited ? 'SQLite QA revision 2' : `SQLite QA synthetic ${sequence}`,
    createdAt: stamp, editedAt: edited ? '2026-10-28T00:01:00.000Z' : null,
    replyToId: null, replyTo: null, forwardedFromId: null, rating: null, attachments: [], reactions: [] };
}
const ticket: HelpTicket = { id: CACHE_PROBE_TICKET_ID, number: CACHE_PROBE_TICKET_ID, title: 'Synthetic local SQLite QA',
  status: 'OPEN', ownerId: CACHE_PROBE_USER_ID, createdAt: stamp, updatedAt: stamp, closedAt: null,
  sourceTicketId: null, sourceTicket: null, itRequested: false, members: [], unreadCount: 1,
  lastMessage: message(3), lastSequence: 3, lastReadSequence: 1, canReopen: false, aiEnabled: false };
const page: HelpHistoryPage = { messages: [message(1), message(2), message(3)], nextCursor: null, olderCursor: null,
  newerCursor: null, hasOlder: false, hasNewer: false, lastReadSequence: 1, firstUnreadSequence: 2,
  lastSequence: 3, eventCursor: 10, snapshotCursor: 10 };

export function installHelpCacheProbe() {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return () => {};
  let lastAction = 'none', failed = false;
  let pending: Promise<unknown> = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = pending.catch(() => {}).then(work); pending = next;
    return next;
  }
  async function inspect() {
    const cached = await readCachedHelpTicket(CACHE_PROBE_USER_ID, CACHE_PROBE_TICKET_ID, 1);
    const first = await readCachedHelpMessage(CACHE_PROBE_USER_ID, CACHE_PROBE_TICKET_ID, messageId(1));
    const deleted = await readCachedHelpMessage(CACHE_PROBE_USER_ID, CACHE_PROBE_TICKET_ID, messageId(2));
    const rows = cached?.page?.messages ?? [], anchor = cached?.record.anchor;
    const present = !!cached, editedPreserved = first?.text === 'SQLite QA revision 2', deletedAbsent = deleted === null;
    const complete = present && rows.length === 2 && rows[0]?.sequence === 1 && rows[1]?.sequence === 3
      && cached.record.syncCursor === 20 && cached.record.snapshotCursor === 20
      && anchor?.sequence === 1 && anchor.offset === -17.25 && anchor.atLatest === false && editedPreserved && deletedAbsent;
    const result = { schema: 1, nativeSQLite: Platform.OS !== 'web', userId: CACHE_PROBE_USER_ID, ticketId: CACHE_PROBE_TICKET_ID,
      present, rowCount: rows.length, sequenceSum: rows.reduce((sum, row) => sum + row.sequence, 0),
      syncCursor: cached?.record.syncCursor ?? null, snapshotCursor: cached?.record.snapshotCursor ?? null,
      rangeCount: cached?.record.ranges.length ?? 0, anchorSequence: anchor?.sequence ?? null, anchorOffset: anchor?.offset ?? null,
      anchorAtLatest: anchor?.atLatest ?? null, editedPreserved, deletedAbsent, complete, lastAction, failed };
    helpDevState({ cacheProbePresent: present, cacheProbeComplete: complete, cacheProbeRowCount: result.rowCount,
      cacheProbeSyncCursor: result.syncCursor, cacheProbeAnchorSequence: result.anchorSequence, cacheProbeAnchorOffset: result.anchorOffset,
      cacheProbeEditedPreserved: editedPreserved, cacheProbeDeletedAbsent: deletedAbsent, cacheProbeFailed: failed });
    return result;
  }
  async function run(action: 'write' | 'read' | 'clear') {
    return enqueue(async () => {
      lastAction = action; failed = false;
      try {
        if (action === 'write') {
          // Repeatable seed only removes this fixed synthetic ticket in this fixed negative account scope.
          await forgetHelpTicket(CACHE_PROBE_USER_ID, CACHE_PROBE_TICKET_ID);
          await cacheHelpPage(CACHE_PROBE_USER_ID, ticket, page);
          await saveHelpViewport(CACHE_PROBE_USER_ID, CACHE_PROBE_TICKET_ID, { messageId: messageId(1), sequence: 1, offset: -17.25, atLatest: false });
          const sync: HelpSyncResult = { ticket, events: [], messages: [message(1, true)], deletedMessageIds: [messageId(2)],
            nextCursor: 20, eventCursor: 20, snapshotCursor: 20, hasMore: false, lastReadSequence: 1, firstUnreadSequence: 3, lastSequence: 3 };
          await cacheHelpSync(CACHE_PROBE_USER_ID, CACHE_PROBE_TICKET_ID, sync);
          // Verify an older delayed page cannot undo the edit or resurrect the tombstone on native SQLite.
          await cacheHelpPage(CACHE_PROBE_USER_ID, ticket, { ...page, eventCursor: 11, snapshotCursor: 11 });
        } else if (action === 'clear') await forgetHelpTicket(CACHE_PROBE_USER_ID, CACHE_PROBE_TICKET_ID);
        return await inspect();
      } catch (error) {
        failed = true; helpDevState({ cacheProbeFailed: true, cacheProbeComplete: false });
        throw error;
      }
    });
  }
  const removeActions = helpDevActions('fixture.cache', {
    'fixture.cache.write': () => run('write'), 'fixture.cache.read': () => run('read'), 'fixture.cache.clear': () => run('clear'),
  });
  // Merely installing/reinstalling the probe never seeds or clears the durable data.
  const removeProbe = helpDevProbe('historyCache', () => enqueue(inspect));
  return () => { removeActions(); removeProbe(); };
}
