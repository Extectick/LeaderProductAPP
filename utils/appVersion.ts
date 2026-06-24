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
  otaSequence: number | null;
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

function getManifestMetadata(): Record<string, unknown> {
  const manifest = Updates.manifest as any;
  const metadata = manifest?.metadata;
  if (metadata && typeof metadata === 'object') return metadata;
  return {};
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
  const metadata = getManifestMetadata();
  const displayVersion = clean(metadata.displayVersion);
  const otaSequenceRaw = Number(metadata.otaSequence);
  const otaSequence = Number.isFinite(otaSequenceRaw) && otaSequenceRaw > 0 ? Math.floor(otaSequenceRaw) : null;
  const otaShortId = updateId ? updateId.slice(0, 8) : null;

  const otaLabel = !Updates.isEnabled
    ? 'OTA off'
    : otaSequence
      ? `ota.${otaSequence}`
    : otaShortId
      ? `OTA ${otaShortId}`
      : Updates.isEmbeddedLaunch
        ? ''
        : 'dev bundle';

  const nativeLabel = nativeBuild ? `v${nativeVersion}+${nativeBuild}` : `v${nativeVersion}`;
  const fullVersionLabel = displayVersion || (otaLabel ? `${nativeLabel} · ${otaLabel}` : nativeLabel);

  return {
    nativeVersion,
    nativeBuild,
    runtimeVersion,
    updateId,
    otaShortId,
    otaSequence,
    otaLabel,
    fullVersionLabel,
  };
}
