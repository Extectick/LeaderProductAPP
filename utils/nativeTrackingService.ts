import { NativeModules, Platform } from 'react-native';

type NativeTrackingStatus = {
  available: boolean;
  enabled?: boolean;
  running?: boolean;
  routeId?: number;
  queueLength?: number;
  lastSentAt?: string | null;
  lastRecordedAt?: string | null;
  lastError?: string | null;
  lastHttpStatus?: number;
  lastServiceStartAt?: number;
};

type NativeTrackingStartConfig = {
  apiBaseUrl: string;
  token: string;
  routeId?: number;
  intervalMs?: number;
};

type LeaderTrackingNativeModule = {
  start(config: NativeTrackingStartConfig): Promise<NativeTrackingStatus>;
  stop(): Promise<NativeTrackingStatus>;
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

export async function getNativeTrackingStatus(): Promise<NativeTrackingStatus> {
  if (!isNativeTrackingAvailable() || !nativeModule) {
    return { available: false };
  }
  return nativeModule.getStatus();
}
