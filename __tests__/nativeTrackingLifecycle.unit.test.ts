import {
  resolveTrackingMode,
  shouldRenewNativeTrackingToken,
} from '../utils/nativeTrackingLifecycle';

describe('native tracking lifecycle', () => {
  const now = Date.UTC(2026, 6, 12, 12, 0, 0);

  it('does not rotate a healthy device token during app lifecycle races', () => {
    expect(shouldRenewNativeTrackingToken({
      hasCredentials: true,
      tokenInvalid: false,
      tokenExpiresAt: now + 60 * 60_000,
    }, now)).toBe(false);
  });

  it('rotates only missing, rejected, expiring, or explicitly replaced credentials', () => {
    expect(shouldRenewNativeTrackingToken({ hasCredentials: false }, now)).toBe(true);
    expect(shouldRenewNativeTrackingToken({ hasCredentials: true, tokenInvalid: true }, now)).toBe(true);
    expect(shouldRenewNativeTrackingToken({ hasCredentials: true, tokenExpiresAt: now + 60_000 }, now)).toBe(true);
    expect(shouldRenewNativeTrackingToken({ hasCredentials: true, tokenExpiresAt: now + 60 * 60_000 }, now, true)).toBe(true);
  });

  it('makes the native collector preferred over the JS fallback', () => {
    expect(resolveTrackingMode({ nativeRunning: true, fallbackRunning: true })).toBe('native');
    expect(resolveTrackingMode({ fallbackRunning: true })).toBe('fallback');
    expect(resolveTrackingMode({})).toBe('inactive');
  });
});
