import { scrubCrashEvent, scrubDiagnosticValue } from '../src/shared/monitoring/privacy';
const { patchMainApplication, nativeSource } = require('../plugins/with-dev-crash-reporting');

test('removes request, extra, PII, location and local variables while preserving error frames', () => {
  const event = scrubCrashEvent({
    user: { id: '42', email: 'test@example.com', ip_address: '127.0.0.1' },
    request: { data: 'private document' }, extra: { token: 'secret' },
    exception: { values: [{ value: 'token=SECRET https://example.com/?secret=YES', stacktrace: { frames: [{ function: 'saveOrder', vars: { document: 'secret' } }] } }] },
    contexts: { location: { latitude: 55 }, device: { model: 'Pixel', name: 'My phone' } },
    breadcrumbs: [{ category: 'http', message: 'private body' }, { category: 'app', message: 'open_order' }],
  });
  expect(event.user).toEqual({ id: '42' });
  expect(event.exception.values[0].stacktrace.frames[0]).toEqual({ function: 'saveOrder' });
  expect(JSON.stringify(event)).not.toMatch(/SECRET|latitude|example.com|secret|private|My phone|test@/);
  expect(event.breadcrumbs).toHaveLength(1);
});

test('nested credentials are scrubbed and circular / large data is bounded', () => {
  const data: any = { authorization: 'secret', value: { apiKey: 'secret', requestBody: 'secret' } };
  data.self = data;
  expect(JSON.stringify(scrubDiagnosticValue(data))).not.toContain('secret');
});

test('native bootstrap is early, idempotent and removed for non-dev builds', () => {
  const source = 'override fun onCreate() {\n    super.onCreate()\n    loadReactNative(this)\n}';
  const once = patchMainApplication(source, true);
  expect(patchMainApplication(once, true)).toBe(once);
  expect(once.indexOf('LeaderCrashReporting')).toBeLessThan(once.indexOf('loadReactNative'));
  expect(patchMainApplication(once, false)).toBe(source);
  expect(nativeSource('https://public@example.com/1')).toContain('options.isSendDefaultPii = false');
});
