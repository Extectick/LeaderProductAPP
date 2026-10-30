import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HelpMessage, HelpTicket } from '../../src/features/help/helpApi';
import type { HelpViewportAnchor } from '../../src/features/help/helpHistoryTypes';

const INDEX = 'help-design-fixture:v1:index';
const DETAIL = 'help-design-fixture:v1:ticket:';
export type FixtureSnapshot = {
  tickets: HelpTicket[];
  histories: [number, HelpMessage[]][];
  anchors: [number, HelpViewportAnchor][];
  readCursors: [number, number][];
  drafts: [string, string][];
  assistantTickets: number[];
  nextTicket: number;
  nextAssistantMessage: number;
};
let memory: FixtureSnapshot | null = null;
let loaded = false;
let loading: Promise<FixtureSnapshot | null> | undefined;
let pending: Promise<unknown> = Promise.resolve();
let revision = 0;
export function fixtureSnapshot() { return memory; }
export function loadFixtureSnapshot(): Promise<FixtureSnapshot | null> {
  if (loaded) return Promise.resolve(memory);
  if (loading) return loading;
  loading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(INDEX);
      if (raw) {
        const index = JSON.parse(raw);
        if (Array.isArray(index.tickets) && [1, 2].includes(index.version)) {
          const keys: string[] = index.version === 2 ? index.historyKeys : index.tickets.map((ticket: HelpTicket) => DETAIL + ticket.id);
          const details = await AsyncStorage.multiGet(keys);
          const histories = new Map<number, HelpMessage[]>();
          for (const [, data] of details) {
            if (!data) continue;
            const row = JSON.parse(data);
            histories.set(row.id, [...histories.get(row.id) ?? [], ...row.messages]);
          }
          // A save during the disk read takes precedence over the older snapshot.
          if (!loaded) memory = { ...index, histories: [...histories] };
        }
      }
    } catch { /* An unreadable QA snapshot falls back to the seed fixtures. */ }
    finally { loaded = true; }
    return memory;
  })();
  return loading;
}
export function saveFixtureSnapshot(snapshot: FixtureSnapshot) {
  memory = snapshot;
  loaded = true;
  const generation = `${Date.now()}-${++revision}`;
  const pairs: [string, string][] = [];
  for (const [id, messages] of snapshot.histories) {
    // Keep every page, splitting values to avoid Android's per-row size limit.
    for (let start = 0; start < messages.length; start += 100) {
      pairs.push([`${DETAIL}${id}:${generation}:${start}`, JSON.stringify({ id, messages: messages.slice(start, start + 100) })]);
    }
  }
  const index = JSON.stringify({ ...snapshot, version: 2, histories: undefined, historyKeys: pairs.map(([key]) => key) });
  const work = pending.catch(() => {}).then(async () => {
    const previous = await AsyncStorage.getItem(INDEX);
    if (pairs.length) await AsyncStorage.multiSet(pairs);
    // Publish the manifest only after all pages have reached storage.
    await AsyncStorage.setItem(INDEX, index);
    if (previous) {
      try {
        const old = JSON.parse(previous);
        const keys = old.version === 2 ? old.historyKeys : old.tickets?.map((ticket: HelpTicket) => DETAIL + ticket.id);
        if (keys?.length) await AsyncStorage.multiRemove(keys);
      } catch { /* Leave orphaned QA pages if their old manifest is unreadable. */ }
    }
  });
  pending = work;
  return work;
}
