// Expo Android headless tasks wrap the actual payload in data.dataString.
// The foreground listener and iOS use the notification content instead.
export function parseTrackingPush(value: unknown, now = Date.now()): { requestId: string; expiresAt: number } | null {
  let payload: any = value;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { return null; }
    }
    if (!payload || typeof payload !== 'object') return null;
    if (payload.type === 'TRACKING_LOCATION_REQUEST') {
      const expiresAt = Date.parse(String(payload.expiresAt || ''));
      const requestId = String(payload.requestId || '');
      return /^[a-zA-Z0-9_-]{1,128}$/.test(requestId) && Number.isFinite(expiresAt) && expiresAt > now ? { requestId, expiresAt } : null;
    }
    payload = payload.dataString ?? payload.notification?.request?.content?.data ?? payload.request?.content?.data ?? payload.data;
  }
  return null;
}
