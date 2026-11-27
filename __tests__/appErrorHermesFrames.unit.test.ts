import { makeAppErrorPayload, readAppErrorPayload } from '@/src/shared/monitoring/appErrorPayload';

jest.mock('expo', () => ({ uuid: { v4: () => '5f1bd8c4-309f-406e-8075-155b91c6e254' } }));
jest.mock('@/utils/appVersion', () => ({
  getAppVersionInfo: () => ({ updateId: '44616726-45c6-4f9f-9636-23db0b90f21c' }),
}));

// Android launchAsset.key from the 0.1.49.5 OTA manifest (no fileExtension).
const assetKey = 'e0cca99345c898939e54a4496a75b03e50511514fbc689a310692d749fc53840';
const otaPath = '/data/user/0/com.leaderproduct.app/files/.expo-internal/' + assetKey;

it('keeps Hermes offsets from installed Expo OTA bundles across delivery queue serialization', () => {
  const stack = [
    'Error: PRIVATE_MESSAGE',
    '    at load (address at ' + otaPath + ':1:32192)',
    '    at retry (address at ' + assetKey + ':1:0)',
    '    at load (address at ' + otaPath + ':1:32192)',
    '    at fallback (address at index.android.bundle:1:541)',
  ].join('\n');
  const report = makeAppErrorPayload({
    error: { name: 'Error', stack }, source: 'react_boundary', screen: 'orders',
    componentStack: '    at ClientOrdersMobileScreen (' + otaPath + ':1:901)',
  })!;
  expect(report.jsFrames).toEqual(['1:32192', '1:0', '1:541', '1:901']);
  expect(report.otaUpdateId).toBe('44616726-45c6-4f9f-9636-23db0b90f21c');
  const json = JSON.stringify(report);
  expect(json).not.toContain(assetKey);
  expect(json).not.toMatch(/PRIVATE_MESSAGE|\.expo-internal|\/data\/user/);
  expect(readAppErrorPayload(json, report.eventId)?.jsFrames).toEqual(report.jsFrames);
});

it('rejects arbitrary extensionless paths, malformed digests and out-of-range coordinates', () => {
  const stack = [
    'Error',
    '    at read (address at /private/order:1:22)',
    '    at read (address at /private/prefix' + assetKey + ':1:23)',
    '    at read (address at /private/' + assetKey.slice(1) + ':1:24)',
    '    at read (address at ' + otaPath + ':1:1234567890)',
    '    at read (address at ' + otaPath + ':1234567890:8)',
    '    at native (native)',
  ].join('\n');
  expect(makeAppErrorPayload({ source: 'global_js', error: { stack } })?.jsFrames).toEqual([]);
});
