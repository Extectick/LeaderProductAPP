import { parseTrackingPush } from '../src/features/tracking/trackingPushPayload';
const now = Date.parse('2026-09-16T06:00:00Z');
const command = { type: 'TRACKING_LOCATION_REQUEST', requestId: 'req-1', expiresAt: '2026-09-16T06:01:00Z' };
it('decodes Android headless dataString and foreground notification payloads', () => {
  expect(parseTrackingPush({ data: { dataString: JSON.stringify(command) } }, now)?.requestId).toBe('req-1');
  expect(parseTrackingPush({ request: { content: { data: command } } }, now)?.requestId).toBe('req-1');
});
it('ignores stale, malformed and unrelated payloads', () => {
  expect(parseTrackingPush(command, now + 60000)).toBeNull();
  expect(parseTrackingPush({ data: { dataString: 'not-json' } }, now)).toBeNull();
  expect(parseTrackingPush({ ...command, requestId: '../bad' }, now)).toBeNull();
  expect(parseTrackingPush({ type: 'OTHER' }, now)).toBeNull();
});
