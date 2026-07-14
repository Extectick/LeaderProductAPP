import { NativeModules, Platform } from 'react-native';

type NativeTrackingStatus = {
  available: boolean;
  enabled?: boolean;
  running?: boolean;
  hasCredentials?: boolean;
  tokenInvalid?: boolean;
  tokenExpiresAt?: number;
  routeId?: number;
  queueLength?: number;
  lastSentAt?: string | null;
  lastRecordedAt?: string | null;
  lastError?: string | null;
  lastHttpStatus?: number;
  lastServiceStartAt?: number;
  lastRetryAt?: number;
  nextRetryAt?: number;
  retryAttempt?: number;
  discardedPoints?: number;
  mode?: 'moving' | 'stationary';
  secureStorage?: boolean;
};

type NativeTrackingStartConfig = {
  apiBaseUrl: string;
  token: string;
  routeId?: number;
  intervalMs?: number;
  tokenExpiresAt?: number;
};

type LeaderTrackingNativeModule = {
  start(config: NativeTrackingStartConfig): Promise<NativeTrackingStatus>;
  stop(): Promise<NativeTrackingStatus>;
  resume(): Promise<NativeTrackingStatus>;
  updateRoute(routeId: number): Promise<NativeTrackingStatus>;
  getStatus(): Promise<NativeTrackingStatus>;
};

const nativeModule = NativeModules.LeaderTracking as LeaderTrackingNativeModule | undefined;

export function isNativeTrackingAvailable() {
  return Platform.OS === 'android' && Boolean(nativeModule);
}

export async function startNativeTracking(
  config: NativeTrackingStartConfig
): Promise<NativeTrackingStatus> {
  if (!isNativeTrackingAvailable() || !nativeModule) {
    return { available: false };
  }
  return nativeModule.start(config);
}

export async function stopNativeTracking(): Promise<NativeTrackingStatus> {
  if (!isNativeTrackingAvailable() || !nativeModule) {
    return { available: false };
  }
  return nativeModule.stop();
}

export async function resumeNativeTracking(): Promise<NativeTrackingStatus> {
  if (!isNativeTrackingAvailable() || !nativeModule) {
    return { available: false };
  }
  return nativeModule.resume();
}

export async function updateNativeTrackingRoute(routeId: number): Promise<NativeTrackingStatus> {
  if (!isNativeTrackingAvailable() || !nativeModule) {
    return { available: false };
  }
  return nativeModule.updateRoute(routeId);
}

export async function getNativeTrackingStatus(): Promise<NativeTrackingStatus> {
  if (!isNativeTrackingAvailable() || !nativeModule) {
    return { available: false };
  }
  return nativeModule.getStatus();
}
