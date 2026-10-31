import type {HelpMessage} from './helpApi';

/** Apply an explicit desired state, so rapid taps can be queued without toggling
 * an outdated server snapshot or removing another participant's reaction. */
export function withHelpReaction(message: HelpMessage, emoji: string, mine: boolean, userId: number): HelpMessage {
  const existing = message.reactions.find(item => item.emoji === emoji);
  if (Boolean(existing?.mine) === mine) return message;
  const reactions = message.reactions.filter(item => item.emoji !== emoji);
  const count = Math.max(0, (existing?.count ?? 0) + (mine ? 1 : -1));
  if (count) {
    const userIds = (existing?.userIds ?? []).filter(id => id !== userId);
    if (mine) userIds.push(userId);
    const next = {emoji, count, mine, userIds};
    const index = existing ? message.reactions.indexOf(existing) : reactions.length;
    reactions.splice(index, 0, next);
  }
  return {...message, reactions};
}
