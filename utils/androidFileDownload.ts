import { API_BASE_URL } from '@/utils/config';
import { getAccessTokenForRequest } from '@/utils/tokenService';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

type AndroidDownloadResult = {
  downloadId: string;
  fileName: string;
  relativePath: string;
};

type LeaderDownloadsNativeModule = {
  enqueue(config: {
    url: string;
    fileName: string;
    mimeType: string;
    title?: string;
    description?: string;
    headers?: Record<string, string>;
  }): Promise<AndroidDownloadResult>;
};

function nativeModule(): LeaderDownloadsNativeModule | null {
  return (NativeModules as any)?.LeaderDownloads ?? null;
}

async function ensureLegacyStoragePermission() {
  const androidVersion = Number(Platform.Version || 0);
  if (!Number.isFinite(androidVersion) || androidVersion >= 29) return;
  const permission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
  const granted = await PermissionsAndroid.check(permission);
  if (granted) return;
  const result = await PermissionsAndroid.request(permission);
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('Нет разрешения на сохранение файла в папку «Загрузки»');
  }
}

function absoluteApiUrl(path: string) {
  if (!API_BASE_URL) throw new Error('Не указан адрес API для скачивания файла');
  return `${API_BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function isAndroidSystemDownloadAvailable() {
  return Platform.OS === 'android' && !!nativeModule();
}

export async function enqueueAuthenticatedAndroidDownload(params: {
  path: string;
  fileName: string;
  mimeType?: string;
  title?: string;
  description?: string;
}) {
  if (Platform.OS !== 'android') {
    throw new Error('Системное скачивание доступно только на Android');
  }
  const module = nativeModule();
  if (!module) {
    throw new Error('Обновите dev APK: системный модуль скачивания ещё не установлен');
  }

  await ensureLegacyStoragePermission();
  const token = await getAccessTokenForRequest();
  if (!token) throw new Error('Сессия истекла. Войдите в приложение заново.');

  return module.enqueue({
    url: absoluteApiUrl(params.path),
    fileName: params.fileName,
    mimeType: params.mimeType || 'application/octet-stream',
    title: params.title || params.fileName,
    description: params.description || 'Скачивание файла',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: params.mimeType || 'application/octet-stream',
    },
  });
}
