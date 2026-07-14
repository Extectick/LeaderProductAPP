export type NativeTrackingCredentialState = {
  hasCredentials?: boolean;
  tokenInvalid?: boolean;
  tokenExpiresAt?: number;
};

const TOKEN_RENEWAL_SAFETY_WINDOW_MS = 5 * 60_000;

/**
 * A native collector owns its scoped token. The React runtime may restart many
 * times, so only an absent, rejected, or near-expired credential can rotate it.
 */
export function shouldRenewNativeTrackingToken(
  status: NativeTrackingCredentialState,
  now = Date.now(),
  force = false
) {
  if (force || !status.hasCredentials || status.tokenInvalid) return true;
  const expiresAt = Number(status.tokenExpiresAt || 0);
  return expiresAt > 0 && expiresAt <= now + TOKEN_RENEWAL_SAFETY_WINDOW_MS;
}

export function resolveTrackingMode(input: {
  nativeRunning?: boolean;
  fallbackRunning?: boolean;
}): 'native' | 'fallback' | 'inactive' {
  if (input.nativeRunning) return 'native';
  if (input.fallbackRunning) return 'fallback';
  return 'inactive';
}
