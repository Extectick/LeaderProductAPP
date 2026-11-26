import { uuid } from 'expo';
import { Platform } from 'react-native';
import { getAppVersionInfo } from '@/utils/appVersion';
import type { OrderLoopStage } from '@/src/features/clientOrders/screen/orderLoopStage';

const screens = ['orders', 'help', 'profile', 'auth', 'services', 'home', 'admin', 'unknown'] as const;
const kinds = ['maximum_update_depth', 'type_error', 'range_error', 'reference_error', 'syntax_error', 'error', 'unknown', 'java_exception', 'native_crash', 'anr', 'slow_operation'] as const;
const sources = ['react_boundary', 'global_js', 'captured', 'android_native', 'performance'] as const;
const stages = ['unknown', 'orders', 'editor-header', 'editor-items', 'product-picker', 'reference-picker',
  'line-editor', 'linked-order', 'filters', 'web-workspace'] as const satisfies readonly OrderLoopStage[];
const uuidPattern = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const identifier = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const coordinate = /^\d{1,9}:\d{1,9}$/;
const dottedVersion = /^\d+(?:\.\d+){0,3}$/;
const digits = /^\d{1,12}$/;

const metrics = ['js_event_loop', 'input_dispatch', 'draft_read_all', 'draft_read_changed'] as const;
export type OrderTimingMetric = typeof metrics[number];
type TimingEvidence = { metric: OrderTimingMetric; durationMs: number };

function validTiming(value: TimingEvidence | undefined): TimingEvidence | undefined {
  if (value && metrics.includes(value.metric) && Number.isInteger(value.durationMs) &&
      value.durationMs >= 500 && value.durationMs <= 120000) {
    return { metric: value.metric, durationMs: value.durationMs };
  }
}

export type AppErrorScreen = typeof screens[number];
export type AppErrorInput = {
  ownerId?: number | null;
  source: Exclude<typeof sources[number], 'android_native' | 'performance'>;
  error: unknown;
  screen?: AppErrorScreen;
  stage?: OrderLoopStage;
  componentStack?: string | null;
};
export type AppErrorPayload = {
  eventId: string;
  occurredAt: string;
  kind: typeof kinds[number];
  platform: 'android' | 'ios' | 'web';
  source: typeof sources[number];
  screen: AppErrorScreen;
  stage: OrderLoopStage;
  appVersion?: string;
  buildNumber?: string;
  runtimeVersion?: string;
  otaUpdateId?: string;
  components: string[];
  jsFrames: string[];
  nativeEvidence?: NativeEvidence;
  timing?: TimingEvidence;
};

type NativeEvidence = {
  androidApi: number;
  exceptionClass?: string;
  frames?: string[];
  signal?: number;
  exitReason?: number;
};
export type NativeAppErrorRecord = {
  environment: 'development' | 'production';
  eventId: string;
  ownerId: string;
  occurredAt: number;
  kind: 'java_exception' | 'native_crash' | 'anr';
  screen: string;
  nativeEvidence: NativeEvidence;
  appVersion?: string;
  buildNumber?: string;
  runtimeVersion?: string;
  updateId?: string;
};

export function appErrorScreenFromPath(path: string): AppErrorScreen {
  const parts = path.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  if (parts[0] === '(auth)') return 'auth';
  if (parts[0] === '(main)') parts.shift();
  switch (parts[0]) {
    case 'services':
      if (parts[1] === 'client_orders') return 'orders';
      if (parts[1] === 'help') return 'help';
      return 'services';
    case 'profile': case 'admin': case 'home': return parts[0];
    case 'AuthScreen': case 'ProfilePendingScreen': case 'ProfileBlockedScreen': case 'ProfileSelectionScreen': return 'auth';
    default: return 'unknown';
  }
}

function formattedUuid(hex: string) {
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function uuidV4(): string {
  try { return uuid.v4(); } catch {
    // LAN web development can expose getRandomValues without randomUUID.
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return formattedUuid(hex);
  }
}

function optionalString(value: unknown, pattern: RegExp, limit: number) {
  return typeof value === 'string' && value.length <= limit && pattern.test(value) ? value : undefined;
}

function lines(stack: unknown) {
  return typeof stack === 'string' ? stack.slice(0, 24000).split('\n', 48) : [];
}

function extractFrames(componentStack: unknown, jsStack: unknown) {
  const components = new Set<string>();
  const jsFrames = new Set<string>();
  const componentLines = lines(componentStack);
  for (const line of componentLines) {
    const name = /^\s*(?:at|in)\s+([A-Za-z_$][\w.$]{0,99})(?=\s|$)/.exec(line)?.[1];
    if (name && identifier.test(name) && components.size < 32) components.add(name);
  }
  // JS frames come first so production Hermes offsets survive the frame cap.
  for (const line of [...lines(jsStack).slice(1), ...componentLines]) {
    const position = /\.(?:bundle|hbc|[cm]?js|tsx?)(?:\?[^\s)]*)?:(\d{1,9}:\d{1,9})(?=\)|\s*$)/.exec(line)?.[1];
    if (position) jsFrames.add(position);
    if (jsFrames.size === 24) break;
  }
  return { components: [...components], jsFrames: [...jsFrames] };
}

function kindFor(error: { message?: unknown; name?: unknown }): AppErrorPayload['kind'] {
  if (typeof error.message === 'string' && /^Maximum update depth exceeded\b/.test(error.message)) return 'maximum_update_depth';
  switch (error.name) {
    case 'TypeError': return 'type_error';
    case 'RangeError': return 'range_error';
    case 'ReferenceError': return 'reference_error';
    case 'SyntaxError': return 'syntax_error';
    case 'Error': return 'error';
    default: return 'unknown';
  }
}

export function makeAppErrorPayload(input: AppErrorInput): AppErrorPayload | null {
  const platform = Platform.OS;
  if (platform !== 'android' && platform !== 'ios' && platform !== 'web') return null;
  const error = input.error && typeof input.error === 'object'
    ? input.error as { message?: unknown; name?: unknown; stack?: unknown } : {};
  const version = getAppVersionInfo();
  return {
    eventId: uuidV4(), occurredAt: new Date().toISOString(), kind: kindFor(error), platform,
    source: input.source, screen: input.screen ?? 'unknown', stage: input.stage ?? 'unknown',
    appVersion: optionalString(version.fullVersionLabel, dottedVersion, 40),
    buildNumber: optionalString(version.nativeBuild, digits, 12),
    runtimeVersion: optionalString(version.runtimeVersion, dottedVersion, 40),
    otaUpdateId: optionalString(version.updateId, uuidPattern, 36),
    ...extractFrames(input.componentStack, error.stack),
  };
}

export function makeOrderTimingPayload(stage: OrderLoopStage, timing: TimingEvidence): AppErrorPayload | null {
  if (Platform.OS !== 'android' || !validTiming(timing)) return null;
  const base = makeAppErrorPayload({ source: 'captured', error: null, screen: 'orders', stage });
  return base && { ...base, kind: 'slow_operation', source: 'performance', timing };
}

function nativeEvidenceFrom(value: NativeEvidence | undefined): NativeEvidence | undefined {
  if (!value || !Number.isInteger(value.androidApi) || value.androidApi < 1 || value.androidApi > 999) return;
  const javaClass = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/;
  const javaFrame = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+(?::\d{1,9})?$/;
  const frames = Array.isArray(value.frames)
    ? value.frames.slice(0, 16).filter(s => optionalString(s, javaFrame, 160)) : undefined;
  const code = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined;
  return {
    androidApi: value.androidApi, frames,
    exceptionClass: optionalString(value.exceptionClass, javaClass, 160),
    signal: code(value.signal, 127), exitReason: code(value.exitReason, 255),
  };
}

export function nativeAppErrorPayload(record: NativeAppErrorRecord): AppErrorPayload | null {
  if (!['java_exception','native_crash','anr'].includes(record.kind) || !/^[a-f\d]{32}$/i.test(record.eventId)) return null;
  const evidence = nativeEvidenceFrom(record.nativeEvidence);
  if (!evidence || !Number.isSafeInteger(record.occurredAt)) return null;
  // The native store strips the hyphens from its UUIDv4. Restore its exact ID.
  const eventId = formattedUuid(record.eventId.toLowerCase());
  if (eventId[14] !== '4' || !uuidPattern.test(eventId)) return null;
  return {
    eventId, occurredAt: new Date(record.occurredAt).toISOString(), kind: record.kind, platform: 'android',
    source: 'android_native', screen: screens.find(s => s === record.screen) ?? 'unknown', stage: 'unknown',
    components: [], jsFrames: [], nativeEvidence: evidence,
    appVersion: optionalString(record.appVersion, dottedVersion, 40),
    buildNumber: optionalString(record.buildNumber, digits, 12),
    runtimeVersion: optionalString(record.runtimeVersion, dottedVersion, 40),
    otaUpdateId: optionalString(record.updateId, uuidPattern, 36),
  };
}

// Reconstruct the allowed fields when reading after an upgrade or interrupted write.
export function readAppErrorPayload(json: string, eventId: string): AppErrorPayload | null {
  try {
    const p = JSON.parse(json);
    if (p?.eventId !== eventId || !uuidPattern.test(eventId) || !kinds.includes(p.kind) ||
      !sources.includes(p.source) || !screens.includes(p.screen) || !stages.includes(p.stage) ||
      !['android','ios','web'].includes(p.platform) ||
      typeof p.occurredAt !== 'string' || new Date(p.occurredAt).toISOString() !== p.occurredAt) return null;
    const validArray = (v: unknown, count: number, maxLen: number, pattern: RegExp): v is string[] =>
      Array.isArray(v) && v.length <= count && v.every(s => optionalString(s, pattern, maxLen) !== undefined);
    if (!validArray(p.components, 32, 100, identifier) || !validArray(p.jsFrames, 24, 19, coordinate)) return null;
    const evidence = p.source === 'android_native' ? nativeEvidenceFrom(p.nativeEvidence) : undefined;
    const isNativeKind = ['java_exception', 'native_crash', 'anr'].includes(p.kind);
    if ((p.source === 'android_native') !== isNativeKind ||
      (isNativeKind && (!evidence || p.platform !== 'android'))) return null;
    const timing = validTiming(p.timing);
    const isTiming = p.kind === 'slow_operation';
    if ((p.source === 'performance') !== isTiming ||
        (isTiming && (!timing || p.screen !== 'orders' || p.platform !== 'android' || p.components.length || p.jsFrames.length)) ||
        (!isTiming && p.timing !== undefined)) return null;
    return {
      timing, nativeEvidence: evidence, eventId, occurredAt: p.occurredAt, kind: p.kind, platform: p.platform, source: p.source,
      screen: p.screen, stage: p.stage, components: p.components, jsFrames: p.jsFrames,
      appVersion: optionalString(p.appVersion, dottedVersion, 40), buildNumber: optionalString(p.buildNumber, digits, 12),
      runtimeVersion: optionalString(p.runtimeVersion, dottedVersion, 40), otaUpdateId: optionalString(p.otaUpdateId, uuidPattern, 36),
    };
  } catch { return null; }
}
