// utils/qrService.ts
import { ErrorResponse, SuccessResponse } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QRCodeItem, QRCodeListResponse } from '../types/apiTypes';
import { AnalyticsPayload, QRCodeItemType, ScansEnvelope } from '../types/qrTypes';
import { apiClient } from './apiClient';

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
// -----------------------------------------------

const CACHE_KEY = 'qrCodesCache';

const SINGLE_QR_CACHE_KEY = 'singleQRCache';

type QRStatus = 'ACTIVE' | 'PAUSED' | 'DELETED';
type QRType = "PHONE" | "LINK" | "EMAIL" | "TEXT" | "WHATSAPP" | "TELEGRAM" | "CONTACT" | "WIFI" | "SMS" | "GEO" | "BITCOIN"

type QRPatchPayload = Partial<{
  qrType: QRType;
  qrData: string | Record<string, any>;
  description: string | null;
  status: QRStatus;
}>;

export const getQRCodesList = async (
  limit = 10,
  offset = 0,
  status: QRStatus = 'ACTIVE',
  forceRefresh = false
): Promise<QRCodeListResponse> => {
  // if (!forceRefresh) {
  //   const cached = await getCachedQRCodes(limit, offset);
  //   if (cached) return cached;
  // }

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    status,                    // ← ПЕРЕДАЁМ ЧЕРЕЗ QUERY
  });

  const response = (await apiClient<undefined, QRCodeListResponse>(
    `/qr?${params.toString()}`,
    { method: 'GET' }          // ← БЕЗ body
  )) as ApiResponse<QRCodeListResponse>;

  if (!response.ok) {
    throw new Error(response.message || 'Ошибка загрузки QR кодов');
  }

  const responseData = response.data;
  const data: QRCodeListResponse = {
    ...responseData,
    data: responseData.data.map((item: QRCodeItem) => ({
      ...item,
      scanCount: item.scanCount ?? 0,
    })),
  };

  // сохраняем в кэш
  // await cacheQRCodes(data, limit, offset);

  return data;
};

export const refreshQRCodes = async (limit = 10, offset = 0): Promise<QRCodeListResponse> => {
  return getQRCodesList(limit, offset, 'ACTIVE', true);
};

export const getQRCodeById = async (id: string, forceRefresh = false): Promise<QRCodeItemType> => {
  // if (!forceRefresh) {
  //   const cached = await getCachedQRCode(id);
  //   if (cached) return cached;
  // }

  const response = (await apiClient<undefined, QRCodeItemType>(`/qr/${id}`, {
    method: 'GET',
  })) as ApiResponse<QRCodeItemType>;

  if (!response.ok) {
    throw new Error(response.message || 'Ошибка загрузки QR кода');
  }

  if (!response.data) {
    throw new Error('Не удалось получить данные QR кода');
  }

  // кэшируем одиночный QR
  // await cacheQRCode(response.data);

  return response.data;
};

async function invalidateCaches(id?: string) {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
    if (id) {
      await AsyncStorage.removeItem(`${SINGLE_QR_CACHE_KEY}_${id}`);
    }
  } catch (e) {
    console.warn('Не удалось инвалидировать кэш', e);
  }
}

// --- CREATE ---
export const createQRCode = async (
  qrType: QRType,
  qrData: string | Record<string, any>,
  description?: string
): Promise<QRCodeItemType> => {
  const body = { qrType, qrData, description };

  const response = (await apiClient<typeof body, QRCodeItemType>('/qr', {
    method: 'POST',
    body, // передаем объект, не JSON.stringify
  })) as ApiResponse<QRCodeItemType>;

  if (!response.ok) {
    throw new Error(response.message || 'Ошибка создания QR кода');
  }

  const item = response.data;
  // инвалидируем список + кэшируем одиночный элемент
  await invalidateCaches(item.id);
  // await cacheQRCode(item);

  return item;
};

// --- UPDATE (partial PATCH) ---
export const updateQRCode = async (
  id: string,
  patch: QRPatchPayload
): Promise<QRCodeItemType> => {
  if (
    patch.qrType === undefined &&
    patch.qrData === undefined &&
    patch.description === undefined &&
    patch.status === undefined
  ) {
    throw new Error('Нет полей для обновления');
  }

  const response = (await apiClient<QRPatchPayload, QRCodeItemType>(`/qr/${id}`, {
    method: 'PATCH',
    body: patch, // частичный объект
  })) as ApiResponse<QRCodeItemType>;

  if (!response.ok) {
    throw new Error(response.message || 'Ошибка обновления QR кода');
  }

  const item = response.data;
  // инвалидируем список и обновляем кэш одиночного
  await invalidateCaches(id);
  // await cacheQRCode(item);

  return item;
};

// --- sugar-хелперы для частичных обновлений ---
export const setQRStatus = (id: string, status: QRStatus) =>
  updateQRCode(id, { status });

export const setQRDescription = (id: string, description: string | null) =>
  updateQRCode(id, { description });

export const setQRType = (id: string, qrType: QRType) =>
  // сервер при смене типа сам пере-нормализует текущие данные
  updateQRCode(id, { qrType });

export const setQRData = (id: string, qrData: string | Record<string, any>) =>
  updateQRCode(id, { qrData });

export const deleteQRCode = (id: string) =>
  // мягкое удаление (как на бэке): статус DELETED
  setQRStatus(id, 'DELETED');


// ---------------------- Вспомогательные вызовы API через apiClient ----------------------
export async function getAnalytics(paramsObj: Record<string, any>): Promise<AnalyticsPayload> {
  const params = new URLSearchParams();
  Object.entries(paramsObj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    params.set(k, String(v));
  });

  const resp = (await apiClient<undefined, AnalyticsPayload>(`/qr/analytics?${params.toString()}`, {
    method: 'GET',
  })) as ApiResponse<AnalyticsPayload>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка получения аналитики');
  if (!resp.data) throw new Error('Пустой ответ аналитики');
  return resp.data;
}

export async function getScans(paramsObj: Record<string, any>): Promise<ScansEnvelope> {
  const params = new URLSearchParams();
  Object.entries(paramsObj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    params.set(k, String(v));
  });

  const resp = (await apiClient<undefined, ScansEnvelope>(`/qr/analytics/scans?${params.toString()}`, {
    method: 'GET',
  })) as ApiResponse<ScansEnvelope>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка получения ленты сканов');
  if (!resp.data) throw new Error('Пустой ответ ленты сканов');
  return resp.data;
}
