import type { OnecLpAppRoutePoint, OnecLpAppTransportTask } from '@/utils/onecLpAppService';
import type { TransportTaskDeparturePoint } from '../types';

export const TRANSPORT_TASK_STATUS_FORMING = 'Формируется';
export const TRANSPORT_TASK_STATUS_ROUTE_ORDERING = 'КУпорядочиваниюМаршрута';
export const TRANSPORT_TASK_STATUS_TO_LOADING = 'КПогрузке';

function normalizedStatus(status?: string | null) {
  return String(status || '').trim().toLowerCase();
}

export function isTransportTaskForming(status?: string | null) {
  const text = normalizedStatus(status);
  return text === TRANSPORT_TASK_STATUS_FORMING.toLowerCase() || text.includes('форм');
}

export function isTransportTaskRouteEditable(status?: string | null) {
  const text = normalizedStatus(status);
  return text === TRANSPORT_TASK_STATUS_ROUTE_ORDERING.toLowerCase() || text.includes('упорядоч');
}

export function isTransportTaskToLoading(status?: string | null) {
  const text = normalizedStatus(status);
  return text === TRANSPORT_TASK_STATUS_TO_LOADING.toLowerCase() || text.includes('погруз');
}

export function transportTaskStatusLabel(status?: string | null) {
  if (isTransportTaskForming(status)) return 'Формируется';
  if (isTransportTaskRouteEditable(status)) return 'Маршрут сформирован';
  if (isTransportTaskToLoading(status)) return 'К погрузке';
  return status || 'Статус не указан';
}

export function transportTaskStatusNotice(status?: string | null) {
  if (isTransportTaskForming(status)) {
    return 'Документ формируется. Маршрут доступен только для просмотра.';
  }
  if (isTransportTaskToLoading(status)) {
    return 'Документ передан к погрузке. Редактирование закрыто.';
  }
  return null;
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCoordinateValue(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toFixed(6);
}

export function routeSummary(task: OnecLpAppTransportTask) {
  const points = task.routePointsCount ?? task.route?.length ?? 0;
  const orders = (task.route ?? []).reduce((sum, point) => sum + (point.orders?.length ?? 0), 0);
  return task.route ? `${points} точек • ${orders} распоряжений` : `${points} точек`;
}

export function statusTone(status?: string | null) {
  const text = normalizedStatus(status);
  if (text.includes('закры')) return { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' };
  if (text.includes('погруз')) return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' };
  if (isTransportTaskRouteEditable(status)) return { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' };
  if (text.includes('отправ')) return { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' };
  return { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' };
}

export function statusIcon(status?: string | null) {
  const text = normalizedStatus(status);
  if (text.includes('закры')) return 'check-circle-outline';
  if (text.includes('погруз')) return 'truck-outline';
  if (isTransportTaskRouteEditable(status)) return 'playlist-edit';
  if (text.includes('отправ')) return 'truck-fast-outline';
  return 'progress-clock';
}

export function departureSourceLabel(point?: TransportTaskDeparturePoint | null) {
  if (!point) return 'Не выбрана';
  if (point.source === 'PRESET') return '';
  if (point.source === 'DEVICE_LOCATION') return 'Снимок геолокации';
  return 'На карте';
}

export function departurePrimaryText(point?: TransportTaskDeparturePoint | null) {
  if (!point) return 'Точка отправления не выбрана';
  if (point.address) return point.address;
  return `${formatCoordinateValue(point.latitude)}, ${formatCoordinateValue(point.longitude)}`;
}

export function coordinatesSummary(point?: { latitude?: number | null; longitude?: number | null } | null) {
  if (!point) return 'Координаты не указаны';
  return `${formatCoordinateValue(point.latitude)} • ${formatCoordinateValue(point.longitude)}`;
}

export function routePointAddress(point: OnecLpAppRoutePoint) {
  return point.address || 'Адрес не указан';
}
