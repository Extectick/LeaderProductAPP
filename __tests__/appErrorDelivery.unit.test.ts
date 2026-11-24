import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@/utils/apiClient';
import { getAppVersionInfo } from '@/utils/appVersion';
import { queueAppErrorReport, queueNativeAppErrorReport, startAppErrorDelivery } from '@/src/shared/monitoring/appErrorDelivery';
import { appErrorScreenFromPath, makeAppErrorPayload, type NativeAppErrorRecord } from '@/src/shared/monitoring/appErrorPayload';

jest.mock('expo', () => ({ uuid: { v4: () => require('node:crypto').randomUUID() } }));
jest.mock('@/utils/apiClient', () => ({ apiClient: jest.fn() }));
jest.mock('@/utils/config', () => ({ API_BASE_URL: 'https://dev.lidprod.ru' }));
jest.mock('@/utils/appVersion', () => ({ getAppVersionInfo: jest.fn() }));
jest.mock('@/src/shared/monitoring/nativeAppErrors', () => ({ drainNativeAppErrors: jest.fn(async () => {}) }), { virtual: true });

const post = jest.mocked(apiClient);
const stop: (() => void)[] = [];
const start = (id: number) => { const end = startAppErrorDelivery(id); stop.push(end); return end; };
const send = (ownerId: number, line = 17) => queueAppErrorReport({
  ownerId, source: 'react_boundary', screen: 'orders', stage: 'editor-items',
  error: { name: 'Error', message: 'Maximum update depth exceeded. SECRET',
    stack: 'Error: SECRET\n at bad (address at index.android.bundle:1:' + line + ')' },
  componentStack: '\n at DraftItems (https://secret.invalid/app.bundle?token=SECRET:3:67)\n in View (created by SECRET)\n raw private data',
});
let now = Date.UTC(2026, 10, 20);
beforeEach(async () => {
  now += 120_000;
  jest.useFakeTimers({ now });
  await AsyncStorage.clear();
  post.mockReset().mockResolvedValue({ ok: true, status: 204 });
  jest.mocked(getAppVersionInfo).mockReturnValue({
    fullVersionLabel: '0.1.47.9', nativeBuild: '47', runtimeVersion: '0.1.47',
    updateId: 'd089cf64-87ca-4c07-9a08-094d52dd60dc',
  } as ReturnType<typeof getAppVersionInfo>);
});
afterEach(() => {
  while (stop.length) stop.pop()?.();
  jest.useRealTimers();
});

it('sends a typed, versioned React report with numeric JS positions, excluding the stack, error text and order data', async () => {
  await send(121);
  start(121);
  await jest.advanceTimersByTimeAsync(1);
  expect(post).toHaveBeenCalledTimes(1);
  const [path, opts] = post.mock.calls[0];
  expect(path).toBe('/api/diagnostics/app-errors');
  expect(opts).toMatchObject({ method:'POST', passive:true, expectedUserId:121, body:{
    source:'react_boundary', screen:'orders', stage:'editor-items', kind:'maximum_update_depth',
    appVersion:'0.1.47.9', buildNumber:'47', runtimeVersion:'0.1.47',
    components:['DraftItems','View'], jsFrames:['1:17','3:67'],
  } });
  expect(JSON.stringify(opts?.body)).not.toMatch(/SECRET|private|secret.invalid|token|ownerId/i);
  expect(await AsyncStorage.getAllKeys()).toHaveLength(0);
});

it.each([[0, 15000], [429, 45000], [503, 15000], [404, 900000], [200, 15000], [401, 15000], [409, 15000]])(
  'retains the same event after status %i, waits for backoff and removes on 204', async (status, delay) => {
    post.mockResolvedValueOnce({ ok: false, status, ...(status === 429 && { retryAfterMs: 45000 }) });
    await send(121);
    start(121);
    await jest.advanceTimersByTimeAsync(delay - 1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getAllKeys()).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]?.body.eventId).toBe(post.mock.calls[0][1]?.body.eventId);
    expect(await AsyncStorage.getAllKeys()).toHaveLength(0);
  });

it('cancels in-flight delivery on account switch; only the initiating account can resume it', async () => {
  let finish!: (v: {ok: boolean; status:number}) => void;
  post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await send(121);
  const first = start(121);
  await jest.advanceTimersByTimeAsync(1);
  first(); stop.pop();
  const second = start(122);
  finish({ok: true, status:204});
  await jest.advanceTimersByTimeAsync(50);
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(await AsyncStorage.getAllKeys()).toHaveLength(1);
  second(); stop.pop();
  start(121);
  await jest.advanceTimersByTimeAsync(1);
  expect(post.mock.calls[1][1]?.body.eventId).toBe(post.mock.calls[0][1]?.body.eventId);
  expect(await AsyncStorage.getAllKeys()).toHaveLength(0);
});

it('keeps 12 events at most, suppresses recurring identical exceptions, excludes old and anonymous incidents', async () => {
  await send(0);
  await Promise.all(Array.from({length: 20}, () => send(121, 1)));
  expect(await AsyncStorage.getAllKeys()).toHaveLength(1);
  await Promise.all(Array.from({length: 20}, (_, i) => send(121, i + 2)));
  expect(await AsyncStorage.getAllKeys()).toHaveLength(12);
  jest.setSystemTime(now + 8 * 86400000);
  start(121);
  await jest.advanceTimersByTimeAsync(1);
  expect(post).not.toHaveBeenCalled();
  expect(await AsyncStorage.getAllKeys()).toHaveLength(0);
});

it('classifies handled and globally uncaught errors outside orders and degrades on an older embedded bundle', () => {
  jest.mocked(getAppVersionInfo).mockReturnValue({fullVersionLabel:'unknown.0'} as ReturnType<typeof getAppVersionInfo>);
  const screen = appErrorScreenFromPath('/(main)/services/help/private-ticket-id?secret=private');
  const report = makeAppErrorPayload({ ownerId: 5, source:'global_js', screen, error:new TypeError('private') });
  expect(report).toMatchObject({kind:'type_error', screen:'help', stage:'unknown'});
  expect(JSON.stringify(report)).not.toMatch(/private|appVersion|otaUpdateId|runtimeVersion|buildNumber/);
  expect(makeAppErrorPayload({source:'captured', error: 'free form secret'})?.kind).toBe('unknown');
  expect(appErrorScreenFromPath('/private/customer')).toBe('unknown');
});

it('only imports authenticated native incidents from this environment and sends the same sanitized ID after re-import', async () => {
  const record: NativeAppErrorRecord = {
    ownerId: '121', environment:'development', eventId:'12345678123442348234567812345678',
    occurredAt:now, kind:'java_exception', screen:'orders', nativeEvidence:{
      androidApi:28, exceptionClass:'java.lang.RuntimeException',
      frames:['com.leader.Main.run:32','token=secret'], exitReason: 4,
    },
  };
  start(121);
  expect(await queueNativeAppErrorReport({...record, ownerId:'122'})).toBe(false);
  expect(await queueNativeAppErrorReport({...record, environment:'production'})).toBe(false);
  expect(await queueNativeAppErrorReport(record)).toBe(true);
  expect(await queueNativeAppErrorReport(record)).toBe(true);
  expect(await AsyncStorage.getAllKeys()).toHaveLength(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(post.mock.calls[0][1]?.body).toMatchObject({
    eventId:'12345678-1234-4234-8234-567812345678', platform:'android', source:'android_native', kind:'java_exception',
    nativeEvidence:{androidApi:28, frames:['com.leader.Main.run:32'], exitReason:4},
  });
  expect(JSON.stringify(post.mock.calls[0][1]?.body)).not.toMatch(/secret|ownerId|environment/);
});
