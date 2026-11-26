import { AppState, Platform } from 'react-native';
import type { OrderLoopStage } from '@/src/features/clientOrders/screen/orderLoopStage';
import type { OrderTimingMetric } from './appErrorPayload';

type Foreground = { ownerId: number; stage: () => OrderLoopStage; since: number };
let active: Foreground | null = null;
const reported = new Map<string, number>();
const cooldown = 60 * 60_000;
const inputEvents = new Set(['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown']);

function measure(session: Foreground, metric: OrderTimingMetric, elapsed: number) {
  const durationMs = Math.round(elapsed);
  const threshold = metric.startsWith('draft_read_') ? 500 : 1000;
  if (active !== session || !Number.isFinite(durationMs) || durationMs < threshold || durationMs > 120_000) return;
  const now = Date.now();
  for (const [key, time] of reported) if (now - time >= cooldown) reported.delete(key);
  const key = session.ownerId + ':' + metric;
  if (reported.has(key)) return;
  reported.set(key, now);
  // The storage and HTTP machinery are only needed after a slow measurement.
  try {
    const { queueOrderTiming } = require('./appErrorDelivery') as typeof import('./appErrorDelivery');
    void queueOrderTiming(session.ownerId, session.stage(), { metric, durationMs });
  } catch { /* A diagnostics failure must never interrupt editing or draft reads. */ }
}

export function startOrderPerformance(ownerId: number, stage: () => OrderLoopStage) {
  if (Platform.OS !== 'android' || !Number.isSafeInteger(ownerId) || ownerId <= 0) return;
  let session: Foreground | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let observer: PerformanceObserver | undefined;
  function stop() {
    if (active === session) active = null;
    session = null;
    if (heartbeat !== undefined) clearInterval(heartbeat);
    heartbeat = undefined;
    observer?.disconnect();
    observer = undefined;
  }
  function start() {
    if (session) return;
    const current = { ownerId, stage, since: performance.now() };
    session = active = current;
    let last = current.since;
    heartbeat = setInterval(() => {
      const next = performance.now();
      measure(current, 'js_event_loop', next - last - 1000);
      last = next;
    }, 1000);
    // RN Fabric Event Timing uses one monotonic clock for the input and its delivery to JS.
    const Observer = globalThis.PerformanceObserver;
    if (Observer?.supportedEntryTypes?.includes('event')) {
      try {
        observer = new Observer(list => {
          for (const entry of list.getEntries()) {
            if (!inputEvents.has(entry.name) || entry.startTime < current.since) continue;
            if ('processingStart' in entry && typeof entry.processingStart === 'number') {
              measure(current, 'input_dispatch', entry.processingStart - entry.startTime);
            }
          }
        });
        const options = { type: 'event', durationThreshold: 1000 };
        observer.observe(options);
      } catch { observer?.disconnect(); observer = undefined; }
    }
  }
  const listener = AppState.addEventListener('change', state => state === 'active' ? start() : stop());
  if (AppState.currentState === 'active') start();
  return () => { listener.remove(); stop(); };
}

export async function measureOrderDraftRead<T>(ownerId: string, metric: 'draft_read_all' | 'draft_read_changed', read: () => Promise<T>): Promise<T> {
  const session = active;
  if (!session || String(session.ownerId) !== ownerId) return read();
  const started = performance.now();
  try { return await read(); }
  finally { measure(session, metric, performance.now() - started); }
}
