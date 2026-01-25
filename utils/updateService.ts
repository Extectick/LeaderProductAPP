import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_BASE_URL } from './config';

const STORAGE_KEYS = {
  installId: 'update:installId',
};

const UPDATE_CHANNEL = process.env.EXPO_PUBLIC_UPDATE_CHANNEL || 'prod';

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
};

type UpdateEventParams = {
  eventType: 'CHECK' | 'PROMPT_SHOWN' | 'UPDATE_CLICK' | 'DISMISS';
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

export async function checkForUpdate(
  params: CheckParams
): Promise<{
  ok: boolean;
  data?: UpdateCheckResult;
  message?: string;
  status?: number;
  etag?: string;
  notModified?: boolean;
}> {
  if (!API_BASE_URL) {
    return { ok: false, message: 'API_BASE_URL is missing' };
  }

  try {
    const headers: Record<string, string> = {};
    if (params.ifNoneMatch) headers['If-None-Match'] = params.ifNoneMatch;

    const response = await axios.get(`${API_BASE_URL}/updates/check`, {
      params: {
        platform: params.platform,
        versionCode: params.versionCode,
        version: params.versionName,
        channel: params.channel || UPDATE_CHANNEL,
        deviceId: params.deviceId,
      },
      headers,
      timeout: 10_000,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (response.status === 304) {
      return { ok: true, notModified: true, etag: params.ifNoneMatch || undefined };
    }

    const payload = response.data;
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
    return { ok: false, message, status };
  }
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
