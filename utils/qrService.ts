// utils/qrService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QRCodeCache, QRCodeItem, QRCodeListResponse } from '../types/apiTypes';
import { QRCodeItemType } from '../types/qrTypes';
import { apiClient } from './apiClient';

const CACHE_KEY = 'qrCodesCache';
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

const SINGLE_QR_CACHE_KEY = 'singleQRCache';
const SINGLE_QR_CACHE_TTL = 5 * 60 * 1000; // 5 минут

export const getQRCodesList = async (
  limit = 10,
  offset = 0,
  forceRefresh = false
): Promise<QRCodeListResponse> => {
  if (!forceRefresh) {
    const cached = await getCachedQRCodes(limit, offset);
    if (cached) return cached;
  }

  const response = await apiClient<undefined, QRCodeListResponse>(`/qr?limit=${limit}&offset=${offset}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(response.message || 'Ошибка загрузки QR кодов');
  }

  const responseData = response.data!;
  const data: QRCodeListResponse = {
    ...responseData,
    data: responseData.data.map((item: QRCodeItem) => ({
      ...item,
      scanCount: item.scanCount ?? 0,
    })),
  };

  // await cacheQRCodes(data, limit, offset);

  return data;
};

async function getCachedQRCodes(limit: number, offset: number): Promise<QRCodeListResponse | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsedCache: QRCodeCache = JSON.parse(cached);
    const now = Date.now();

    if (
      now - parsedCache.timestamp > CACHE_TTL ||
      parsedCache.meta.limit !== limit ||
      parsedCache.meta.offset !== offset
    ) {
      return null;
    }

    return {
      data: parsedCache.data,
      meta: parsedCache.meta,
    };
  } catch (error) {
    console.error('Ошибка чтения кэша:', error);
    return null;
  }
}

async function cacheQRCodes(data: QRCodeListResponse, limit: number, offset: number): Promise<void> {
  try {
    const cache: QRCodeCache = {
      data: data.data,
      meta: {
        total: data.meta.total,
        limit,
        offset,
      },
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Ошибка сохранения в кэш:', error);
  }
}

export const refreshQRCodes = async (limit = 10, offset = 0): Promise<QRCodeListResponse> => {
  return getQRCodesList(limit, offset, true);
};

export const getQRCodeById = async (id: string, forceRefresh = false): Promise<QRCodeItemType> => {
  if (!forceRefresh) {
    const cached = await getCachedQRCode(id);
    if (cached) return cached;
  }

  const response = await apiClient<undefined, QRCodeItemType>(`/qr/${id}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(response.message || 'Ошибка загрузки QR кода');
  }

  if (!response.data) {
    throw new Error('Не удалось получить данные QR кода');
  }

  // await cacheQRCode(response.data);

  return response.data;
};

async function getCachedQRCode(id: string): Promise<QRCodeItemType | null> {
  try {
    const cached = await AsyncStorage.getItem(`${SINGLE_QR_CACHE_KEY}_${id}`);
    if (!cached) return null;

    const parsedCache = JSON.parse(cached);
    const now = Date.now();

    if (now - parsedCache.timestamp > SINGLE_QR_CACHE_TTL) {
      return null;
    }

    return parsedCache.data;
  } catch (error) {
    console.error('Ошибка чтения кэша QR кода:', error);
    return null;
  }
}

async function cacheQRCode(data: QRCodeItemType): Promise<void> {
  try {
    const cache = {
      data,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(`${SINGLE_QR_CACHE_KEY}_${data.id}`, JSON.stringify(cache));
  } catch (error) {
    console.error('Ошибка сохранения QR кода в кэш:', error);
  }
}

export const createQRCode = async (
  qrType: string,
  qrData: string | Record<string, any>,
  description?: string
): Promise<QRCodeItemType> => {
  const body = { qrType, qrData, description };

  const response = await apiClient<typeof body, QRCodeItemType>('/qr', {
    method: 'POST',
    body, // передаем объект, не JSON.stringify
  });

  if (!response.ok) {
    throw new Error(response.message || 'Ошибка создания QR кода');
  }

  return response.data!;
};

export const updateQRCode = async (
  id: string,
  qrType: string,
  qrData: string | Record<string, any>,
  description?: string
): Promise<QRCodeItemType> => {
  const body = { qrType, qrData, description };

  const response = await apiClient<typeof body, QRCodeItemType>(`/qr/${id}`, {
    method: 'PUT',
    body, // передаем объект, не JSON.stringify
  });

  if (!response.ok) {
    throw new Error(response.message || 'Ошибка обновления QR кода');
  }

  return response.data!;
};
