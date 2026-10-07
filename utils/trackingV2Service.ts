import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { trackingLogDiagnostics, type TrackingReliability } from './trackingReliability';
import { loadTraccarSdk } from './traccarSdk';

import { apiClient } from './apiClient';
import { API_BASE_URL } from './config';
import {
  getNativeTrackingStatus,
  resumeNativeTracking,
  stopNativeTracking,
} from './nativeTrackingService';
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
const LEGACY_QUEUE_DRAIN_TIMEOUT_MS = 15_000;

export type TrackingV2Diagnostics = TrackingReliability & {
  available: boolean;
  enabled: boolean;
  running: boolean;
  permission: 'granted' | 'denied' | 'undetermined';
  backgroundPermission: 'granted' | 'denied' | 'undetermined';
  activityRecognitionPermission: 'granted' | 'denied' | 'unavailable';
  locationServicesEnabled: boolean;
  preciseLocation?: boolean;
  lastRecordedAt?: string;
  lastSentAt?: string;
  lastError?: string;
};

type BootstrapResponse = {
  credential: string;
  endpoint: string;
  reused: boolean;
};

let operations: Promise<unknown> = Promise.resolve();
let startOperation: Promise<void> | null = null;
let restoreOperation: Promise<boolean> | null = null;
let intentGeneration = 0;
let configuredIdentity: string | null = null;
let lastBootstrapAt = 0;

function serialize<T>(action: () => Promise<T>): Promise<T> {
  const next = operations.then(action, action);
  operations = next.catch(() => undefined);
  return next;
}

export async function getTrackingReliability(): Promise<TrackingReliability> {
  if (Platform.OS !== 'android' || !NativeModules.LeaderTracking?.getReliabilityStatus) return {};
  return NativeModules.LeaderTracking.getReliabilityStatus().catch(() => ({}));
}

export async function openTrackingSettings(kind: 'battery' | 'location' | 'app') {
  if (Platform.OS === 'android' && NativeModules.LeaderTracking?.openTrackingSettings) {
    await NativeModules.LeaderTracking.openTrackingSettings(kind);
  } else await Linking.openSettings();
}

async function setNativeCommandsEnabled(enabled: boolean) {
  // Additive bridge: older APKs can still use the direct foreground request.
  if (Platform.OS === 'android' && NativeModules.LeaderTracking?.setCommandsEnabled) {
    await NativeModules.LeaderTracking.setCommandsEnabled(enabled);
  }
}

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(trackingServerUrl('/tracking/native/device'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`DEVICE_REVOKE_${response.status}`);
  } finally { clearTimeout(timeout); }
}

async function flushPendingRevocation() {
  const pending = await getPendingRevocation();
  if (!pending) return;
  await revokeCredentialDirectly(pending);
  await setPendingRevocation(null);
}

const wait = (durationMs: number) => new Promise<void>((resolve) => setTimeout(resolve, durationMs));

async function drainLegacyNativeQueue() {
  let status = await getNativeTrackingStatus().catch(() => ({
    available: false,
    queueLength: 0,
    tokenInvalid: false,
  }));
  if (!status.available || !status.queueLength) return;
  if (status.tokenInvalid) {
    throw new Error('Старые точки маршрута ожидают отправки, но ключ устройства недействителен');
  }

  await resumeNativeTracking();
  const deadline = Date.now() + LEGACY_QUEUE_DRAIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await wait(750);
    status = await getNativeTrackingStatus().catch(() => status);
    if (!status.queueLength) return;
    if (status.tokenInvalid) {
      throw new Error('Не удалось отправить старые точки: ключ устройства недействителен');
    }
  }
  throw new Error('Старые точки маршрута ещё не отправлены. Подключитесь к интернету и повторите включение');
}

async function migrateLegacyTracking() {
  if (await AsyncStorage.getItem(KEYS.migration)) return;
  const legacyEnabled = await AsyncStorage.getItem(LEGACY_ENABLED_KEY);
  await flushTrackingQueue('[tracking-v2:migration]').catch(() => undefined);
  // The legacy native collector owns a separate encrypted queue. Do not stop
  // it (which removes its credentials and queue) until pending fixes have
  // actually reached the API.
  await drainLegacyNativeQueue();
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
    timeoutMs: 10_000,
    body: {
      ...device,
      credential: existing || undefined,
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version || null,
      deviceName: `${Platform.OS}-${device.installId.slice(-8)}`,
    },
  });
  if (!response.ok || !response.data?.credential) {
    throw Object.assign(new Error(response.message || 'Не удалось зарегистрировать устройство геотрекинга'), { status: response.status });
  }
  await setCredential(response.data.credential);
  lastBootstrapAt = Date.now();
  return { credential: response.data.credential, endpoint: response.data.endpoint };
}

async function configureTraccar(options: { requireBootstrap?: boolean; allowOfflineCredential?: boolean } = {}) {
  if (Platform.OS !== 'android') throw new Error('Фоновый трекинг v2 пока доступен только на Android');
  const Traccar = await loadTraccarSdk();
  await flushPendingRevocation().catch(() => undefined);
  const storedCredential = await getCredential();
  let bootstrap = { credential: storedCredential || '', endpoint: '/tracking/native/osmand' };
  if (options.requireBootstrap || !storedCredential) {
    try { bootstrap = await bootstrapCredential(); }
    catch (error) {
      const status = Number((error as { status?: number })?.status || 0);
      const health = await getTrackingReliability();
      // Network/5xx does not invalidate an existing key; explicit auth/permission
      // failures do. Never revive a tracker stopped by a native 401/403.
      if (!options.allowOfflineCredential || !storedCredential || health.commandError === 'DEVICE_AUTH_REQUIRED'
        || (status > 0 && status < 500 && status !== 408 && status !== 429)) throw error;
    }
  }
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
    // The tracker stops GPS while stationary, so keeping the short-lived
    // processing/upload pipeline awake has a small cost but prevents queued
    // fixes from being stranded when Android puts the CPU to sleep.
    wakeLock: true,
    buffer: true,
    preferPlatformProviders: false,
    notification: { text: 'Геомаршрут записывается' },
  };
  await Traccar.init(config);
  const identity = JSON.stringify(config);
  if (configuredIdentity !== identity) {
    await Traccar.setConfig(config);
    configuredIdentity = identity;
  }
  return Traccar;
}

export async function requestTrackingPermissions() {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const notification = await Notifications.requestPermissionsAsync();
    if (notification.status !== 'granted') {
      throw new Error('Разрешите уведомления, чтобы видеть постоянное уведомление о записи геомаршрута');
    }
  }
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;
  if (Platform.OS === 'android' && Number(Platform.Version) >= 29) {
    const activity = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
    );
    if (activity !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Разрешите распознавание физической активности для возобновления GPS после остановки');
    }
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted';
}

export async function startTrackingV2() {
  if (startOperation) return startOperation;
  const generation = ++intentGeneration;
  startOperation = serialize(async () => {
    if (!(await requestTrackingPermissions())) throw new Error('Разрешите постоянный доступ к геопозиции');
    if (generation !== intentGeneration) return;
    await migrateLegacyTracking();
    const Traccar = await configureTraccar({ requireBootstrap: true, allowOfflineCredential: true });
    if (generation !== intentGeneration) return;
    // Persist intent before starting the native service. If Android interrupts
    // the startup sequence, the next authenticated launch repairs it.
    await AsyncStorage.setItem(KEYS.enabled, 'true');
    await Traccar.start();
    if (generation !== intentGeneration) { await Traccar.stop(); return; }
    await setNativeCommandsEnabled(true);
    if (generation !== intentGeneration) { await setNativeCommandsEnabled(false); await Traccar.stop(); return; }
    const device = await getAuthDevicePayload();
    await apiClient('/tracking/device/status', {
      method: 'PATCH',
      timeoutMs: 10_000,
      body: { installId: device.installId, enabled: true },
    }).catch(() => undefined);
  }).finally(() => { startOperation = null; });
  return startOperation;
}

export async function stopTrackingV2(options: { revoke?: boolean } = {}) {
  ++intentGeneration;
  // Persist pause before waiting on any network/SDK operation.
  await AsyncStorage.setItem(KEYS.enabled, 'false');
  await setNativeCommandsEnabled(false).catch(() => undefined);
  if (Platform.OS === 'android') {
    // Stop capture immediately, even while bootstrap is waiting for the network.
    const Traccar = await loadTraccarSdk();
    await Traccar.stop().catch(() => undefined);
  }
  return serialize(async () => {
    // Repeat inside the serialized section: a previously pending start may
    // have crossed its native bridge call while the immediate pause ran.
    await setNativeCommandsEnabled(false).catch(() => undefined);
    if (Platform.OS === 'android') {
      const Traccar = await loadTraccarSdk();
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
        await apiClient(path, { method: 'DELETE', timeoutMs: 10_000, body: { installId: device.installId } }).catch(() => undefined);
      }
      await removeCredential();
    } else {
      await apiClient('/tracking/device/status', {
        method: 'PATCH',
        timeoutMs: 10_000,
        body: { installId: device.installId, enabled: false },
      }).catch(() => undefined);
    }
    await AsyncStorage.setItem(KEYS.enabled, 'false');
    configuredIdentity = null;
    lastBootstrapAt = 0;
  });
}

export async function restoreTrackingV2() {
  if (restoreOperation) return restoreOperation;
  const generation = intentGeneration;
  restoreOperation = serialize(async () => {
    await migrateLegacyTracking();
    const enabled = (await AsyncStorage.getItem(KEYS.enabled)) === 'true';
    if (!enabled || Platform.OS !== 'android' || generation !== intentGeneration) return false;
    const [foreground, background, activityAllowed] = await Promise.all([
      Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync(),
      Number(Platform.Version) >= 29 ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION) : Promise.resolve(true),
    ]);
    if (foreground.status !== 'granted' || background.status !== 'granted' || !activityAllowed) return false;
    // A valid durable key can keep collecting offline. Explicitly rejected
    // keys require a successful authenticated bootstrap before restarting.
    const health = await getTrackingReliability();
    if (health.notificationsEnabled === false || (Number(Platform.Version) >= 33
      && (await Notifications.getPermissionsAsync()).status !== 'granted')) return false;
    const Traccar = await configureTraccar({
      requireBootstrap: Date.now() - lastBootstrapAt > 5 * 60_000 || health.commandError === 'DEVICE_AUTH_REQUIRED',
      allowOfflineCredential: true,
    });
    if (generation !== intentGeneration || (await AsyncStorage.getItem(KEYS.enabled)) !== 'true') return false;
    if (!(await Traccar.isTracking())) await Traccar.start();
    if (generation !== intentGeneration) { await Traccar.stop(); return false; }
    await setNativeCommandsEnabled(true);
    if (generation !== intentGeneration) { await setNativeCommandsEnabled(false); await Traccar.stop(); return false; }
    return true;
  }).finally(() => { restoreOperation = null; });
  return restoreOperation;
}

export async function requestTrackingPosition(requestId?: string) {
  if (Platform.OS !== 'android') throw new Error('Запрос позиции на этом устройстве не поддерживается');
  if (!(await isTrackingV2Enabled()) || !(await getCredential())) throw new Error('Включите отслеживание маршрута в профиле');
  if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') throw new Error('Нет разрешения на геопозицию');
  if (!(await Location.hasServicesEnabledAsync())) throw new Error('На телефоне выключена геолокация');
  const generation = intentGeneration;
  const Traccar = await serialize(() => configureTraccar());
  if (generation !== intentGeneration || !(await isTrackingV2Enabled())) throw new Error('Отслеживание приостановлено');
  const sent = await Traccar.requestPosition(requestId ? `lp:${requestId}` : undefined);
  if (!sent) throw new Error('Телефон не смог определить или отправить координаты. Проверьте GPS и интернет');
  return true;
}

export async function getTrackingV2Diagnostics(): Promise<TrackingV2Diagnostics> {
  const reliability = await getTrackingReliability();
  const [foreground, background, locationServicesEnabled, enabled, activityRecognitionPermission] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Location.hasServicesEnabledAsync().catch(() => false),
    AsyncStorage.getItem(KEYS.enabled),
    Platform.OS === 'android' && Number(Platform.Version) >= 29
      ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION)
        .then((granted) => granted ? 'granted' as const : 'denied' as const)
        .catch(() => 'denied' as const)
      : Promise.resolve('unavailable' as const),
  ]);
  let running = false;
  let lastRecordedAt: string | undefined;
  let lastSentAt: string | undefined;
  let lastError: string | undefined;
  if (Platform.OS === 'android') {
    try {
      const Traccar = await loadTraccarSdk();
      running = await Traccar.isTracking();
      const logs = await Traccar.getLogs();
      ({ lastSentAt, lastError } = trackingLogDiagnostics(logs));
    } catch (error) {
      lastError = 'Не удалось проверить фоновый сервис. Попробуйте восстановить отслеживание';
    }
  }
  return {
    ...reliability,
    available: Platform.OS === 'android',
    enabled: enabled === 'true',
    running,
    permission: foreground.status,
    backgroundPermission: background.status,
    activityRecognitionPermission,
    locationServicesEnabled,
    preciseLocation: foreground.android?.accuracy ? foreground.android.accuracy === 'fine' : undefined,
    lastRecordedAt,
    lastSentAt,
    lastError,
  };
}

export async function isTrackingV2Enabled() {
  const [enabled, legacyEnabled] = await AsyncStorage.multiGet([KEYS.enabled, LEGACY_ENABLED_KEY]);
  return enabled[1] === 'true' || (!enabled[1] && legacyEnabled[1] === 'true');
}
