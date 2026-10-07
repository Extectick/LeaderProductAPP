import { Platform } from 'react-native';

import type { LocationObject } from 'expo-location';

export type OrderGeoEventInput = {
  clientEventId: string;
  type: 'CREATED' | 'SUBMITTED';
  status: 'CAPTURED' | 'UNAVAILABLE' | 'PERMISSION_DENIED' | 'TIMEOUT';
  capturedAt: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  source?: string;
  reason?: string;
};

function eventId(type: OrderGeoEventInput['type']) {
  return `${type.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function unavailable(type: OrderGeoEventInput['type'], status: OrderGeoEventInput['status'], reason: string): OrderGeoEventInput {
  return { clientEventId: eventId(type), type, status, capturedAt: new Date().toISOString(), source: Platform.OS, reason };
}

function captured(type: OrderGeoEventInput['type'], location: LocationObject, source: string): OrderGeoEventInput {
  return {
    clientEventId: eventId(type), type, status: 'CAPTURED',
    capturedAt: new Date(location.timestamp || Date.now()).toISOString(),
    latitude: location.coords.latitude, longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? null, source,
  };
}

export async function captureOrderGeoEvent(type: OrderGeoEventInput['type'], timeoutMs = 9_000): Promise<OrderGeoEventInput> {
  if (Platform.OS === 'web') return unavailable(type, 'UNAVAILABLE', 'WEB_LOCATION_NOT_CAPTURED');
  // Lazy require keeps the native Expo module out of list/document startup and
  // makes capture a no-op dependency until a point is actually requested.
  const Location = require('expo-location') as typeof import('expo-location');
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') return unavailable(type, 'PERMISSION_DENIED', 'LOCATION_PERMISSION_DENIED');
  if (!(await Location.hasServicesEnabledAsync().catch(() => false))) return unavailable(type, 'UNAVAILABLE', 'LOCATION_SERVICES_DISABLED');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), timeoutMs);
      }),
    ]);
    return captured(type, position, 'fresh');
  } catch {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000, requiredAccuracy: 250 }).catch(() => null);
    return last ? captured(type, last, 'last-known') : unavailable(type, 'TIMEOUT', 'LOCATION_TIMEOUT');
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
