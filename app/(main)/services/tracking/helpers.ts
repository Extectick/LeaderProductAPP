import type { UserOption } from './types';
import type { RoutePointDto } from '@/utils/trackingService';

export const DEFAULT_POINTS_LIMIT = 100;
export const DEFAULT_MAX_ACCURACY = 20;
export const MIN_POINT_DISTANCE_METERS = 12;

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export const humanName = (u?: UserOption | null) => {
  if (!u) return 'Не выбрано';
  const parts = [u.lastName, u.firstName, u.middleName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return u.email || `ID ${u.id}`;
};

export const isoToDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDateOnly = (d?: Date | null) => {
  if (!d) return '';
  try {
    return d.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
};

export const formatTime = (d?: Date | null) => {
  if (!d) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const parseTime = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):?(\d{0,2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
};

const toRad = (deg: number) => (deg * Math.PI) / 180;

const calcDistanceMeters = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) => {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return 6371000 * c;
};

export const filterNearbyPoints = (
  pts: RoutePointDto[],
  minDistanceMeters = MIN_POINT_DISTANCE_METERS
) => {
  if (pts.length < 2) return pts;
  const result: RoutePointDto[] = [];
  for (const p of pts) {
    const tooClose = result.some((keep) => calcDistanceMeters(keep, p) < minDistanceMeters);
    if (!tooClose) {
      result.push(p);
    }
  }
  return result;
};

export const parseLimitValue = (
  value?: string | number | null,
  fallback = DEFAULT_POINTS_LIMIT
) => {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 2000);
};

export const startOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};

export const endOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
};

export const buildMonthGrid = (month: Date, startOfWeek: 0 | 1 = 1) => {
  const d0 = new Date(month.getFullYear(), month.getMonth(), 1);
  const shift = (d0.getDay() - startOfWeek + 7) % 7;
  const start = new Date(d0);
  start.setDate(d0.getDate() - shift);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};
