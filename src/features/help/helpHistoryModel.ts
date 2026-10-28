import type { HelpMessage } from './helpApi';
import type { HelpHistoryPage, HelpHistoryRange, HelpNavigationTarget, HelpViewportAnchor } from './helpHistoryTypes';

export function mergeHelpMessages(previous: HelpMessage[], incoming: HelpMessage[]) {
  const messages = new Map(previous.map(message => [message.id, message]));
  incoming.forEach(message => messages.set(message.id, message));
  return [...messages.values()].sort((a, b) => a.sequence - b.sequence);
}

/** A range is known contiguous from a server page, not from adjacent cached IDs. */
export function mergeHelpRanges(ranges: HelpHistoryRange[], page: HelpHistoryPage): HelpHistoryRange[] {
  if (!page.messages.length) return ranges;
  const next = [...ranges, {
    from: page.messages[0].sequence, to: page.messages[page.messages.length - 1].sequence,
    hasOlder: page.hasOlder, hasNewer: page.hasNewer,
    ...(!page.hasNewer ? { throughSequence: page.lastSequence } : {}),
  }].sort((a, b) => a.from - b.from);
  const merged: HelpHistoryRange[] = [];
  for (const range of next) {
    const previous = merged[merged.length - 1];
    if (!previous || range.from > previous.to + 1) { merged.push({ ...range }); continue; }
    if (range.from === previous.from) previous.hasOlder = previous.hasOlder && range.hasOlder;
    if (range.throughSequence !== undefined) previous.throughSequence=Math.max(previous.throughSequence??0,range.throughSequence);
    if (range.to > previous.to) { previous.to = range.to; previous.hasNewer = range.hasNewer; }
    else if (range.to === previous.to) previous.hasNewer = previous.hasNewer && range.hasNewer;
  }
  return merged;
}

export function initialHelpPosition(anchor: HelpViewportAnchor | null, firstUnreadSequence: number | null,
  explicit?: { messageId?: number; sequence?: number }): Omit<HelpNavigationTarget, 'key'> {
  if (explicit?.messageId || explicit?.sequence) return { kind: 'message', ...explicit, animate: false };
  if (anchor && !anchor.atLatest) return { kind: 'anchor', ...anchor, animate: false };
  if (firstUnreadSequence) return { kind: 'unread', sequence: firstUnreadSequence, animate: false };
  return { kind: 'latest', animate: false };
}

/** Realtime updates can refresh existing rows; they cannot bridge an unloaded gap. */
export function reconcileHelpWindow(current: HelpMessage[], changed: HelpMessage[], deletedIds: number[], atLatest: boolean) {
  const deleted = new Set(deletedIds), known = new Set(current.map(message => message.id));
  const lastSequence = current[current.length - 1]?.sequence ?? 0;
  const updates = changed.filter(message => known.has(message.id) || (atLatest && message.sequence > lastSequence));
  return mergeHelpMessages(current.filter(message => !deleted.has(message.id)), updates.filter(message => !deleted.has(message.id)));
}

export function validHelpAnchor(anchor: HelpViewportAnchor) {
  return Number.isSafeInteger(anchor.messageId) && anchor.messageId > 0
    && Number.isSafeInteger(anchor.sequence) && anchor.sequence > 0 && Number.isFinite(anchor.offset)
    && typeof anchor.atLatest === 'boolean';
}

/** Called at a settled viewport, never when a page response races an active drag. */
export function trimHelpWindow(messages:HelpMessage[],anchor:HelpViewportAnchor,direction:'older'|'newer',limit=600){
  if(messages.length<=limit)return null;
  const index=messages.findIndex(message=>message.id===anchor.messageId&&message.sequence===anchor.sequence);
  if(index<0)return null;
  const maxStart=messages.length-limit,margin=Math.min(100,Math.floor(limit/4));
  let start=direction==='older'?0:maxStart;
  if(index<start+margin||index>=start+limit-margin)start=Math.max(0,Math.min(maxStart,index-Math.floor(limit/3)));
  return {messages:messages.slice(start,start+limit),removedOlder:start>0,removedNewer:start+limit<messages.length};
}
