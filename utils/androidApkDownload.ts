import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import {
  completeHandler,
  createDownloadTask,
  directories,
  getExistingDownloadTasks,
  setConfig,
} from '@kesha-antonov/react-native-background-downloader';
import { Platform } from 'react-native';

const DOWNLOAD_ID_PREFIX = 'apk-update:';
const APK_MIME = 'application/vnd.android.package-archive';
const INSTALL_FLAGS = 1 | 268435456;

let configured = false;

export type AndroidApkDownloadStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'NOT_FOUND'
  | 'UNKNOWN';

export type AndroidApkDownloadState = {
  downloadId: string;
  versionCode: number;
  fileName: string;
  checksumMd5?: string | null;
  updateId?: number | null;
};

type NativeStatusResult = {
  status: AndroidApkDownloadStatus;
  downloadId: string;
  downloadedBytes?: number;
  totalBytes?: number;
  reason?: number;
  localUri?: string | null;
};

type NativeEnqueueResult = {
  downloadId: string;
  fileName: string;
};

function ensureConfigured() {
  if (configured || Platform.OS !== 'android') return;
  setConfig({
    showNotificationsEnabled: true,
    progressInterval: 1000,
    progressMinBytes: 256 * 1024,
  });
  configured = true;
}

function sanitizeFileName(fileName: string) {
  const cleaned = String(fileName || 'update.apk')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim();
  const normalized = cleaned || 'update.apk';
  return normalized.toLowerCase().endsWith('.apk') ? normalized : `${normalized}.apk`;
}

function buildDownloadId(fileName: string) {
  return `${DOWNLOAD_ID_PREFIX}${sanitizeFileName(fileName)}`;
}

function getDestination(fileName: string) {
  return `${directories.documents}/${sanitizeFileName(fileName)}`;
}

function getDestinationFromId(downloadId: string) {
  if (!downloadId.startsWith(DOWNLOAD_ID_PREFIX)) return null;
  return getDestination(downloadId.slice(DOWNLOAD_ID_PREFIX.length));
}

function asFileUri(path: string) {
  return path.startsWith('file://') ? path : `file://${path}`;
}

function mapTaskState(state: string): AndroidApkDownloadStatus {
  if (state === 'DOWNLOADING') return 'RUNNING';
  if (state === 'PAUSED') return 'PAUSED';
  if (state === 'DONE') return 'SUCCESSFUL';
  if (state === 'FAILED' || state === 'STOPPED') return 'FAILED';
  if (state === 'PENDING') return 'PENDING';
  return 'UNKNOWN';
}

async function findExistingTask(downloadId: string) {
  ensureConfigured();
  const tasks = await getExistingDownloadTasks();
  return tasks.find((task) => task.id === downloadId) ?? null;
}

export function isAndroidApkDownloadSupported() {
  return Platform.OS === 'android';
}

export async function enqueueAndroidApkDownload(
  url: string,
  fileName: string,
  title?: string | null,
  description?: string | null
): Promise<NativeEnqueueResult> {
  if (!isAndroidApkDownloadSupported()) {
    throw new Error('Android APK background download is unavailable.');
  }

  ensureConfigured();

  const safeFileName = sanitizeFileName(fileName);
  const downloadId = buildDownloadId(safeFileName);
  const existingTask = await findExistingTask(downloadId);
  if (existingTask) {
    return { downloadId, fileName: safeFileName };
  }

  const destination = getDestination(safeFileName);
  const task = createDownloadTask({
    id: downloadId,
    url,
    destination,
    metadata: { fileName: safeFileName, title: title ?? null, description: description ?? null },
    isAllowedOverMetered: true,
    isAllowedOverRoaming: true,
  });

  task.start();
  return { downloadId, fileName: safeFileName };
}

export async function getAndroidApkDownloadStatus(
  downloadId: string
): Promise<NativeStatusResult> {
  if (!isAndroidApkDownloadSupported()) {
    throw new Error('Android APK background download is unavailable.');
  }

  const task = await findExistingTask(downloadId);
  if (task) {
    return {
      status: mapTaskState(task.state),
      downloadId,
      downloadedBytes: task.bytesDownloaded,
      totalBytes: task.bytesTotal,
      localUri: task.destination ? asFileUri(task.destination) : null,
    };
  }

  const fallbackPath = getDestinationFromId(downloadId);
  if (fallbackPath) {
    const info = await FileSystem.getInfoAsync(asFileUri(fallbackPath));
    if (info.exists) {
      return {
        status: 'SUCCESSFUL',
        downloadId,
        localUri: asFileUri(fallbackPath),
      };
    }
  }

  return {
    status: 'NOT_FOUND',
    downloadId,
  };
}

export async function openAndroidDownloadedApk(downloadId: string) {
  if (!isAndroidApkDownloadSupported()) {
    throw new Error('Android APK background download is unavailable.');
  }

  const task = await findExistingTask(downloadId);
  const path = task?.destination || getDestinationFromId(downloadId);
  if (!path) {
    throw new Error('APK file path is unavailable.');
  }

  const fileUri = asFileUri(path);
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    throw new Error('APK file is not downloaded yet.');
  }

  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: APK_MIME,
    flags: INSTALL_FLAGS,
  });

  completeHandler(downloadId);
}

export async function removeAndroidApkDownload(downloadId: string) {
  if (!isAndroidApkDownloadSupported()) return 0;

  const task = await findExistingTask(downloadId);
  if (task) {
    await task.stop();
  }

  const fallbackPath = getDestinationFromId(downloadId);
  if (fallbackPath) {
    try {
      await FileSystem.deleteAsync(asFileUri(fallbackPath), { idempotent: true });
    } catch {}
  }

  return 1;
}
