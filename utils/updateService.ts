import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_BASE_URL } from './config';

const STORAGE_KEYS = {
  installId: 'update:installId',
};

const UPDATE_CHANNEL = process.env.EXPO_PUBLIC_UPDATE_CHANNEL || 'prod';
const UPDATE_CHECK_TIMEOUT_MS = 3500;
const UPDATE_DEBUG_LOGS = process.env.EXPO_PUBLIC_UPDATE_DEBUG === 'true';
const UPDATE_CHECK_MEMORY_CACHE_MS = 60_000;

export type UpdateCheckResult = {
  updateAvailable: boolean;
  mandatory: boolean;
  latestId?: number;
  latestVersionCode?: number;
  latestVersionName?: string;
  minSupportedVersionCode?: number;
  rolloutPercent?: number;
  releaseNotes?: string | null;
  storeUrl?: string | null;
  downloadUrl?: string | null;
  fileSize?: number | null;
  checksum?: string | null;
  checksumMd5?: string | null;
};

type CheckParams = {
  platform: 'android' | 'ios';
  versionCode: number;
  versionName?: string;
  deviceId?: string;
  channel?: string;
  ifNoneMatch?: string | null;
  force?: boolean;
};

type UpdateCheckResponse = {
  ok: boolean;
  data?: UpdateCheckResult;
  message?: string;
  status?: number;
  etag?: string;
  notModified?: boolean;
};

const updateCheckCache = new Map<string, { expiresAt: number; result: UpdateCheckResponse }>();
const updateCheckLoads = new Map<string, Promise<UpdateCheckResponse>>();

type UpdateEventParams = {
  eventType:
    | 'CHECK'
    | 'PROMPT_SHOWN'
    | 'UPDATE_CLICK'
    | 'DISMISS'
    | 'DOWNLOAD_START'
    | 'DOWNLOAD_DONE'
    | 'VERIFY_FAILED'
    | 'INSTALL_CLICK'
    | 'OTA_READY'
    | 'OTA_RELOAD';
  platform: 'android' | 'ios';
  versionCode: number;
  versionName?: string;
  deviceId?: string;
  updateId?: number;
  channel?: string;
};

function createInstallId() {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `inst_${ts}_${rand}`;
}

export async function getInstallId(): Promise<string> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.installId);
  if (stored) return stored;
  const next = createInstallId();
  await AsyncStorage.setItem(STORAGE_KEYS.installId, next);
  return next;
}

async function checkForUpdateUncached(params: CheckParams): Promise<UpdateCheckResponse> {
  if (!API_BASE_URL) {
    return { ok: false, message: 'API_BASE_URL is missing' };
  }

  try {
    const headers: Record<string, string> = {};
    if (params.ifNoneMatch) headers['If-None-Match'] = params.ifNoneMatch;

    if (UPDATE_DEBUG_LOGS) {
      console.info('[update] check request', {
        apiBaseUrl: API_BASE_URL,
        platform: params.platform,
        versionCode: params.versionCode,
        versionName: params.versionName,
        channel: params.channel || UPDATE_CHANNEL,
      });
    }

    const response = await axios.get(`${API_BASE_URL}/updates/check`, {
      params: {
        platform: params.platform,
        versionCode: params.versionCode,
        version: params.versionName,
        channel: params.channel || UPDATE_CHANNEL,
        deviceId: params.deviceId,
      },
      headers,
      timeout: UPDATE_CHECK_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (response.status === 304) {
      return { ok: true, notModified: true, etag: params.ifNoneMatch || undefined };
    }

    const payload = response.data;
    if (UPDATE_DEBUG_LOGS) {
      console.info('[update] check response', {
        status: response.status,
        updateAvailable: Boolean((payload?.data ?? payload)?.updateAvailable),
        latestVersionCode: (payload?.data ?? payload)?.latestVersionCode,
        latestVersionName: (payload?.data ?? payload)?.latestVersionName,
      });
    }

    return {
      ok: true,
      data: payload?.data ?? payload,
      status: response.status,
      etag: response.headers?.etag,
    };
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 304) {
      return { ok: true, notModified: true, etag: params.ifNoneMatch || undefined };
    }
    const message = error?.response?.data?.message || error?.message || 'Unknown error';
    console.warn('[update] check failed', {
      status,
      message,
      apiBaseUrl: API_BASE_URL,
      versionCode: params.versionCode,
      channel: params.channel || UPDATE_CHANNEL,
    });
    return { ok: false, message, status };
  }
}

export async function checkForUpdate(params: CheckParams): Promise<UpdateCheckResponse> {
  const cacheKey = JSON.stringify([
    params.platform,
    params.versionCode,
    params.versionName || '',
    params.channel || UPDATE_CHANNEL,
    params.deviceId || '',
    params.ifNoneMatch || '',
  ]);

  if (!params.force) {
    const cached = updateCheckCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    const existingLoad = updateCheckLoads.get(cacheKey);
    if (existingLoad) return existingLoad;
  }

  const load = checkForUpdateUncached(params).then((result) => {
    if (!params.force) {
      updateCheckCache.set(cacheKey, {
        result,
        expiresAt: Date.now() + UPDATE_CHECK_MEMORY_CACHE_MS,
      });
    }
    return result;
  }).finally(() => {
    updateCheckLoads.delete(cacheKey);
  });

  if (!params.force) updateCheckLoads.set(cacheKey, load);
  return load;
}

export async function logUpdateEvent(params: UpdateEventParams) {
  if (!API_BASE_URL) return;
  try {
    const token = await AsyncStorage.getItem('accessToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    await axios.post(
      `${API_BASE_URL}/updates/events`,
      {
        eventType: params.eventType,
        platform: params.platform,
        channel: params.channel || UPDATE_CHANNEL,
        versionCode: params.versionCode,
        versionName: params.versionName,
        deviceId: params.deviceId,
        updateId: params.updateId,
      },
      {
        headers,
        timeout: 8000,
      }
    );
  } catch {
    // avoid breaking app on analytics errors
  }
}
