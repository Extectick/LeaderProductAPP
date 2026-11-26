type Event = { userId: string; draftIds?: readonly string[]; order?: any; previousGuid?: string | null };
const listeners = new Set<(event: Event) => void>();
const versions = new Map<string, number>();
export function orderOutboxChangeVersion(userId: string) {
  return versions.get(userId) ?? 0;
}
export function emitOrderOutboxChange(event: Event) {
  versions.set(event.userId, orderOutboxChangeVersion(event.userId) + 1);
  for (const listener of listeners) { try { listener(event); } catch { /* isolated subscribers */ } }
}
export function subscribeOrderOutboxChange(listener: (event: Event) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
