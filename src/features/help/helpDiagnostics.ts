import { AppState, Dimensions, PixelRatio } from 'react-native';

type Metric = string | number | boolean | null;
type Metrics = Record<string, Metric>;
type Rect = { x: number; y: number; width: number; height: number; centerX: number };
type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };
type Action = (value?: unknown) => unknown;
const enabled = typeof __DEV__ !== 'undefined' && __DEV__;
const events: { at: number; event: string; data: Metrics }[] = [];
const state: Metrics = {};
const nodes = new Map<string, Measurable>();
const actions = new Map<string, Record<string, Action>>();
const probes = new Map<string, () => Promise<unknown>>();
const last = new Map<string, string>();
let fixtureControls = false;

/** Never pass message/search text, identities, URLs or network payloads here. */
export function helpDevEvent(event: string, data: Metrics) {
  if (!enabled) return;
  const serialized = JSON.stringify(data);
  if (last.get(event) === serialized) return;
  last.set(event, serialized);
  const entry = { at: Date.now(), event, data };
  events.push(entry);
  if (events.length > 200) events.shift();
  console.info(`[HELP_UI] ${JSON.stringify(entry)}`);
}

export function helpDevState(data: Metrics) {
  if (!enabled) return;
  Object.assign(state, data);
  helpDevEvent('state', data);
}

export function helpDevRef(name: string, node: Measurable | null) {
  if (!enabled) return;
  if (node) nodes.set(name, node); else nodes.delete(name);
}

export function helpDevActions(owner: string, handlers: Record<string, Action>) {
  if (!enabled) return () => {};
  actions.set(owner, handlers);
  return () => { if (actions.get(owner) === handlers) actions.delete(owner); };
}

/** Called ONLY by qa/help-preview; normal app builds expose no command handlers. */
export function enableHelpFixtureControls() { if (enabled) fixtureControls = true; }

/** Native probes return geometry only, never text or network data. */
export function helpDevProbe(name: string, probe: () => Promise<unknown>) {
  if (!enabled) return () => {};
  probes.set(name,probe);
  return () => { if(probes.get(name)===probe)probes.delete(name); };
}

async function snapshot() {
  const rects: Record<string, Rect> = {};
  await Promise.all([...nodes].map(([name, node]) => new Promise<void>(resolve => {
    if (typeof node.measureInWindow !== 'function') { resolve(); return; }
    const timer = setTimeout(resolve, 200);
    node.measureInWindow((x, y, width, height) => {
      clearTimeout(timer);
      if (width > 0 && height > 0) rects[name] = { x, y, width, height, centerX: x + width / 2 };
      resolve();
    });
  })));
  const menuAxis = rects['header.menu']?.centerX;
  const deviations = Object.entries(rects).filter(([key]) => key.startsWith('list.meta.') || key.startsWith('list.unread.')).map(([, rect]) => Math.abs(rect.centerX - (menuAxis ?? rect.centerX)));
  const native = Object.fromEntries(await Promise.all([...probes].map(async ([name,probe]) => [name,await probe()])));
  return { version: 1, fixtureControls, viewport: Dimensions.get('window'), density: PixelRatio.get(), state: { ...state }, rects, native, rightAxisMaxDeviation: menuAxis === undefined ? null : Math.max(0, ...deviations), actions: fixtureControls ? [...actions.values()].flatMap(group => Object.keys(group)) : [], events: events.slice(-80) };
}

if (enabled) {
  (globalThis as any).__LEADER_HELP_DEV__ = {
    appState: () => AppState.currentState,
    snapshot,
    clearEvents: () => { events.length = 0; last.clear(); },
    act: async (name: string, value?: unknown) => {
      if (!fixtureControls) throw new Error('Commands are available only in the isolated Help QA fixture');
      const handler = [...actions.values()].map(group => group[name]).find(Boolean);
      if (!handler) throw new Error(`Unavailable Help QA action: ${name}`);
      helpDevEvent('action', { name }); // Arguments deliberately excluded.
      await handler(value);
      return { accepted: name };
    },
  };
}
