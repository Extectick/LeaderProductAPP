import AsyncStorage from '@react-native-async-storage/async-storage';
import { QRCodeCache, QRCodeListResponse } from '../types/apiTypes';
import { authFetch } from './authFetch';

const CACHE_KEY = 'qrCodesCache';
const CACHE_TTL = 5 * 60 * 1000; // 5 минут кэша

export const getQRCodesList = async (
  limit: number = 10,
  offset: number = 0,
  forceRefresh: boolean = false
): Promise<QRCodeListResponse> => {
  // Проверка кэша
  if (!forceRefresh) {
    const cached = await getCachedQRCodes(limit, offset);
    if (cached) return cached;
  }

  const response = await authFetch<QRCodeListResponse>(`/qr?limit=${limit}&offset=${offset}`);
  if (!response.ok) {
    throw new Error(response.message || 'Ошибка загрузки QR кодов');
  }
  
  // Сохранение в кэш
  await cacheQRCodes(response.data as QRCodeListResponse, limit, offset);
  
  return response.data as QRCodeListResponse;
};

async function getCachedQRCodes(limit: number, offset: number): Promise<QRCodeListResponse | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsedCache: QRCodeCache = JSON.parse(cached);
    const now = Date.now();

    // Проверка TTL и соответствия параметрам пагинации
    if (now - parsedCache.timestamp > CACHE_TTL || 
        parsedCache.meta.limit !== limit || 
        parsedCache.meta.offset !== offset) {
      return null;
    }

    return {
      data: parsedCache.data,
      meta: parsedCache.meta
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
        offset
      },
      timestamp: Date.now()
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Ошибка сохранения в кэш:', error);
  }
}

export const refreshQRCodes = async (limit: number = 10, offset: number = 0): Promise<QRCodeListResponse> => {
  return getQRCodesList(limit, offset, true);
};
