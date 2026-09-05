import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { apiClient } from './apiClient';
import { API_BASE_URL } from './config';
import { stopNativeTracking } from './nativeTrackingService';
import { getAuthDevicePayload } from './tokenService';
import { flushTrackingQueue } from './trackingUploader';

const KEYS = {
  enabled: 'tracking:v2:enabled',
  credential: 'tracking:v2:credential',
  pendingRevocation: 'tracking:v2:pending-revocation',
  migration: 'tracking:v2:legacy-migrated',
};
// expo-secure-store accepts only alphanumeric characters, `.`, `-` and `_`
// in keys. Keep these separate from the AsyncStorage keys above, where `:` is
// valid and already used by released builds.
const SECURE_KEYS = {
  credential: 'tracking.v2.credential',
  pendingRevocation: 'tracking.v2.pending_revocation',
};
const LEGACY_EXPO_TASK = 'BACKGROUND_LOCATION_TRACKING';
const LEGACY_ENABLED_KEY = 'tracking:enabled';

export type TrackingV2Diagnostics = {
  available: boolean;
  enabled: boolean;
  running: boolean;
  permission: 'granted' | 'denied' | 'undetermined';
  backgroundPermission: 'granted' | 'denied' | 'undetermined';
  locationServicesEnabled: boolean;
  lastRecordedAt?: string;
  lastSentAt?: string;
  lastError?: string;
};

type BootstrapResponse = {
  credential: string;
  endpoint: string;
  reused: boolean;
};

let operation: Promise<void> | null = null;

function trackingServerUrl(endpoint = '/tracking/native/osmand') {
  if (!API_BASE_URL) throw new Error('Не настроен адрес API для геотрекинга');
  return `${API_BASE_URL.replace(/\/+$/, '')}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

async function getCredential() {
  if (Platform.OS === 'web') return AsyncStorage.getItem(KEYS.credential);
  const stored = await SecureStore.getItemAsync(SECURE_KEYS.credential);
  if (stored) return stored;

  // Some intermediate builds could persist this value through an
  // AsyncStorage fallback. Move it only after SecureStore accepts the value.
  const legacy = await AsyncStorage.getItem(KEYS.credential);
  if (!legacy) return null;
  await SecureStore.setItemAsync(SECURE_KEYS.credential, legacy);
  await AsyncStorage.removeItem(KEYS.credential);
  return legacy;
}

async function setCredential(value: string) {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(KEYS.credential, value);
  } else {
    await SecureStore.setItemAsync(SECURE_KEYS.credential, value);
    await AsyncStorage.removeItem(KEYS.credential);
  }
}

async function removeCredential() {
  await AsyncStorage.removeItem(KEYS.credential);
  if (Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync(SECURE_KEYS.credential).catch(() => undefined);
  }
}

async function getPendingRevocation() {
  if (Platform.OS === 'web') return AsyncStorage.getItem(KEYS.pendingRevocation);
  const stored = await SecureStore.getItemAsync(SECURE_KEYS.pendingRevocation);
  if (stored) return stored;

  const legacy = await AsyncStorage.getItem(KEYS.pendingRevocation);
  if (!legacy) return null;
  await SecureStore.setItemAsync(SECURE_KEYS.pendingRevocation, legacy);
  await AsyncStorage.removeItem(KEYS.pendingRevocation);
  return legacy;
}

async function setPendingRevocation(value: string | null) {
  if (Platform.OS === 'web') {
    if (value) await AsyncStorage.setItem(KEYS.pendingRevocation, value);
    else await AsyncStorage.removeItem(KEYS.pendingRevocation);
    return;
  }
  if (value) {
    await SecureStore.setItemAsync(SECURE_KEYS.pendingRevocation, value);
    await AsyncStorage.removeItem(KEYS.pendingRevocation);
  } else {
    await SecureStore.deleteItemAsync(SECURE_KEYS.pendingRevocation).catch(() => undefined);
    await AsyncStorage.removeItem(KEYS.pendingRevocation);
  }
}

async function revokeCredentialDirectly(credential: string) {
  const response = await fetch(trackingServerUrl('/tracking/native/device'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!response.ok) throw new Error(`DEVICE_REVOKE_${response.status}`);
}

async function flushPendingRevocation() {
  const pending = await getPendingRevocation();
  if (!pending) return;
  await revokeCredentialDirectly(pending);
  await setPendingRevocation(null);
}

async function migrateLegacyTracking() {
  if (await AsyncStorage.getItem(KEYS.migration)) return;
  const legacyEnabled = await AsyncStorage.getItem(LEGACY_ENABLED_KEY);
  await flushTrackingQueue('[tracking-v2:migration]').catch(() => undefined);
  await stopNativeTracking().catch(() => undefined);
  await Location.stopLocationUpdatesAsync(LEGACY_EXPO_TASK).catch(() => undefined);
  if (legacyEnabled === 'true') await AsyncStorage.setItem(KEYS.enabled, 'true');
  await AsyncStorage.setItem(KEYS.migration, new Date().toISOString());
}

async function bootstrapCredential() {
  const device = await getAuthDevicePayload();
  const existing = await getCredential();
  const response = await apiClient<
    Record<string, unknown>,
    BootstrapResponse
  >('/tracking/device/bootstrap', {
    method: 'POST',
    body: {
      ...device,
      credential: existing || undefined,
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version || null,
      deviceName: `${Platform.OS}-${device.installId.slice(-8)}`,
    },
  });
  if (!response.ok || !response.data?.credential) {
    throw new Error(response.message || 'Не удалось зарегистрировать устройство геотрекинга');
  }
  await setCredential(response.data.credential);
  return { credential: response.data.credential, endpoint: response.data.endpoint };
}

async function configureTraccar(options: { requireBootstrap?: boolean } = {}) {
  if (Platform.OS !== 'android') throw new Error('Фоновый трекинг v2 пока доступен только на Android');
  const Traccar = await import('react-native-traccar-client-sdk');
  await flushPendingRevocation().catch(() => undefined);
  const storedCredential = await getCredential();
  const bootstrap = options.requireBootstrap || !storedCredential
    ? await bootstrapCredential()
    : { credential: storedCredential, endpoint: '/tracking/native/osmand' };
  const config = {
    serverUrl: trackingServerUrl(bootstrap.endpoint),
    deviceId: bootstrap.credential,
    location: {
      accuracy: 'HIGH' as const,
      distanceMeters: 25,
      intervalSeconds: 90,
      angleDegrees: 0,
      stopDetection: true,
      stopTimeoutSeconds: 90,
      stationaryRadiusMeters: 35,
      heartbeatIntervalSeconds: 120,
    },
    wakeLock: false,
    buffer: true,
    preferPlatformProviders: false,
    notification: { text: 'Геомаршрут записывается' },
  };
  await Traccar.init(config);
  await Traccar.setConfig(config).catch(async () => Traccar.init(config));
  return Traccar;
}

export async function requestTrackingPermissions() {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const notification = await Notifications.requestPermissionsAsync();
    if (notification.status !== 'granted') {
      throw new Error('Разрешите уведомления: Android требует их для постоянного фонового трекинга');
    }
  }
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted';
}

export async function startTrackingV2() {
  if (operation) return operation;
  operation = (async () => {
    if (!(await requestTrackingPermissions())) throw new Error('Разрешите постоянный доступ к геопозиции');
    await migrateLegacyTracking();
    const Traccar = await configureTraccar({ requireBootstrap: true });
    await Traccar.start();
    await AsyncStorage.setItem(KEYS.enabled, 'true');
    const device = await getAuthDevicePayload();
    await apiClient('/tracking/device/status', {
      method: 'PATCH',
      body: { installId: device.installId, enabled: true },
    }).catch(() => undefined);
  })().finally(() => { operation = null; });
  return operation;
}

export async function stopTrackingV2(options: { revoke?: boolean } = {}) {
  if (Platform.OS === 'android') {
    const Traccar = await import('react-native-traccar-client-sdk');
    await Traccar.stop().catch(() => undefined);
  }
  const device = await getAuthDevicePayload();
  const path = '/tracking/device/bootstrap';
  if (options.revoke) {
    const credential = await getCredential();
    if (credential) {
      await setPendingRevocation(credential);
      await revokeCredentialDirectly(credential)
        .then(() => setPendingRevocation(null))
        .catch(() => undefined);
    } else {
      await apiClient(path, { method: 'DELETE', body: { installId: device.installId } }).catch(() => undefined);
    }
    await removeCredential();
  } else {
    await apiClient('/tracking/device/status', {
      method: 'PATCH',
      body: { installId: device.installId, enabled: false },
    }).catch(() => undefined);
  }
  await AsyncStorage.setItem(KEYS.enabled, 'false');
}

export async function restoreTrackingV2() {
  await migrateLegacyTracking();
  const enabled = (await AsyncStorage.getItem(KEYS.enabled)) === 'true';
  if (!enabled || Platform.OS !== 'android') return false;
  const Traccar = await configureTraccar();
  if (!(await Traccar.isTracking())) await Traccar.start();
  return true;
}

export async function requestTrackingPosition(requestId?: string) {
  if (Platform.OS !== 'android') return false;
  const Traccar = await configureTraccar();
  return Traccar.requestPosition(requestId ? `lp:${requestId}` : undefined);
}

export async function getTrackingV2Diagnostics(): Promise<TrackingV2Diagnostics> {
  const [foreground, background, locationServicesEnabled, enabled] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Location.hasServicesEnabledAsync().catch(() => false),
    AsyncStorage.getItem(KEYS.enabled),
  ]);
  let running = false;
  let lastRecordedAt: string | undefined;
  let lastSentAt: string | undefined;
  let lastError: string | undefined;
  if (Platform.OS === 'android') {
    try {
      const Traccar = await import('react-native-traccar-client-sdk');
      running = await Traccar.isTracking();
      const logs = await Traccar.getLogs();
      for (const entry of [...logs].reverse()) {
        const message = String(entry.message || '');
        if (!lastSentAt && /send|upload|success|response.*200/i.test(message)) lastSentAt = new Date(entry.time).toISOString();
        if (!lastRecordedAt && /location|position/i.test(message)) lastRecordedAt = new Date(entry.time).toISOString();
        if (!lastError && /error|fail|exception/i.test(message)) lastError = message.replace(/[A-Za-z0-9_-]{32,}/g, '[credential]');
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    available: Platform.OS === 'android',
    enabled: enabled === 'true',
    running,
    permission: foreground.status,
    backgroundPermission: background.status,
    locationServicesEnabled,
    lastRecordedAt,
    lastSentAt,
    lastError,
  };
}

export async function isTrackingV2Enabled() {
  const [enabled, legacyEnabled] = await AsyncStorage.multiGet([KEYS.enabled, LEGACY_ENABLED_KEY]);
  return enabled[1] === 'true' || (!enabled[1] && legacyEnabled[1] === 'true');
}
