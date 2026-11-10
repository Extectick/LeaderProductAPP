type Event = { userId: string; order?: any; previousGuid?: string | null };
const listeners = new Set<(event: Event) => void>();
export function emitOrderOutboxChange(event: Event) {
  for (const listener of listeners) { try { listener(event); } catch { /* isolated subscribers */ } }
}
export function subscribeOrderOutboxChange(listener: (event: Event) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
