import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

export type AppVersionInfo = {
  nativeVersion: string;
  nativeBuild: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  otaShortId: string | null;
  otaLabel: string;
  fullVersionLabel: string;
};

function clean(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function getConfigBuildVersion(): string | null {
  if (Platform.OS === 'android') {
    return clean(Constants.expoConfig?.android?.versionCode);
  }
  if (Platform.OS === 'ios') {
    return clean(Constants.expoConfig?.ios?.buildNumber);
  }
  return null;
}

export function getAppVersionInfo(): AppVersionInfo {
  const nativeVersion =
    clean(Application.nativeApplicationVersion) ||
    clean(Constants.nativeAppVersion) ||
    clean(Constants.expoConfig?.version) ||
    'unknown';
  const nativeBuild =
    clean(Application.nativeBuildVersion) ||
    clean(Constants.nativeBuildVersion) ||
    getConfigBuildVersion();
  const runtimeVersion = clean(Updates.runtimeVersion) || nativeVersion;
  const updateId = clean(Updates.updateId);
  const otaShortId = updateId ? updateId.slice(0, 8) : null;

  const otaLabel = !Updates.isEnabled
    ? 'OTA off'
    : otaShortId
      ? `OTA ${otaShortId}`
      : Updates.isEmbeddedLaunch
        ? 'embedded'
        : 'dev bundle';

  const nativeLabel = nativeBuild ? `v${nativeVersion}+${nativeBuild}` : `v${nativeVersion}`;

  return {
    nativeVersion,
    nativeBuild,
    runtimeVersion,
    updateId,
    otaShortId,
    otaLabel,
    fullVersionLabel: `${nativeLabel} · ${otaLabel}`,
  };
}
