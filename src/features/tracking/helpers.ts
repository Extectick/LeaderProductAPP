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

function getViewerTimeZone(explicitTimeZone?: string) {
  if (explicitTimeZone) return explicitTimeZone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function formatOffsetLabel(offsetMinutes?: number | null) {
  if (typeof offsetMinutes !== 'number' || !Number.isFinite(offsetMinutes)) return undefined;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return minutes ? `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}` : `UTC${sign}${hours}`;
}

function formatDateTimePartsInFixedOffset(date: Date, offsetMinutes: number) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(shifted);
  const timeLabel = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
  }).format(shifted);
  return { dateLabel, timeLabel };
}

function formatDateTimePartsInZone(date: Date, timeZone?: string | null) {
  const options = timeZone ? { timeZone } : undefined;
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    ...options,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat('ru-RU', {
    ...options,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return { dateLabel, timeLabel };
}

export function getRoutePointDateTimeLabels(
  point: Pick<RoutePointDto, 'recordedAt' | 'recordedTimeZone' | 'recordedTimezoneOffsetMinutes'>,
  options?: { viewerTimeZone?: string }
) {
  const date = isoToDate(point.recordedAt);
  if (!date) {
    return {
      dateLabel: '-',
      timeLabel: '-',
      primary: '-',
      secondary: undefined as string | undefined,
      timeZoneLabel: undefined as string | undefined,
    };
  }

  const viewerTimeZone = getViewerTimeZone(options?.viewerTimeZone);
  let dateLabel: string;
  let timeLabel: string;
  let timeZoneLabel = formatOffsetLabel(point.recordedTimezoneOffsetMinutes);

  if (point.recordedTimeZone) {
    try {
      const parts = formatDateTimePartsInZone(date, point.recordedTimeZone);
      dateLabel = parts.dateLabel;
      timeLabel = parts.timeLabel;
      timeZoneLabel = timeZoneLabel || point.recordedTimeZone;
    } catch {
      const parts =
        typeof point.recordedTimezoneOffsetMinutes === 'number'
          ? formatDateTimePartsInFixedOffset(date, point.recordedTimezoneOffsetMinutes)
          : formatDateTimePartsInZone(date);
      dateLabel = parts.dateLabel;
      timeLabel = parts.timeLabel;
    }
  } else if (typeof point.recordedTimezoneOffsetMinutes === 'number') {
    const parts = formatDateTimePartsInFixedOffset(date, point.recordedTimezoneOffsetMinutes);
    dateLabel = parts.dateLabel;
    timeLabel = parts.timeLabel;
  } else {
    const parts = formatDateTimePartsInZone(date);
    dateLabel = parts.dateLabel;
    timeLabel = parts.timeLabel;
  }

  let secondary: string | undefined;
  if (viewerTimeZone && point.recordedTimeZone && viewerTimeZone !== point.recordedTimeZone) {
    try {
      const viewer = formatDateTimePartsInZone(date, viewerTimeZone);
      secondary = `у вас ${viewer.dateLabel} ${viewer.timeLabel}`;
    } catch {
      secondary = undefined;
    }
  }

  return {
    dateLabel,
    timeLabel,
    primary: `${dateLabel} ${timeLabel}${timeZoneLabel ? ` (${timeZoneLabel})` : ''}`,
    secondary,
    timeZoneLabel,
  };
}

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
