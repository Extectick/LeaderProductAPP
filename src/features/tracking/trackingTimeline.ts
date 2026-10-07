import type { TrackingDayData } from '@/utils/trackingService';
import type { TrackingTimelineItem } from './TrackingDayPanel.types';
import { trackingTime } from './trackingPresentation';

type Position = { latitude?: number | null; longitude?: number | null };
function nearby(a: Position, b: Position) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return false;
  const lat = (a.latitude + b.latitude) * Math.PI / 360;
  return Math.hypot((a.latitude - b.latitude) * 111_195, (a.longitude - b.longitude) * 111_195 * Math.cos(lat)) <= 100;
}
function money(value?: string | null) {
  return value != null && Number.isFinite(Number(value))
    ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value))} ₽` : '—';
}

// GPS fixes, stops and order events share one chronology. Never infer an order's
// location from time alone, or interpret a gap between fixes as waiting time.
export function buildTrackingTimeline(data: TrackingDayData | null): TrackingTimelineItem[] {
  if (!data) return [];
  const orders = data.orderEvents;
  const watermark = data.orderEventsNextCursor
    ? Date.parse(orders[orders.length - 1]?.capturedAt || '') : Infinity;
  const available = (at: string) => Date.parse(at) < watermark;
  const insideStop = (at: string, stop: TrackingDayData['stops'][number]) =>
    Date.parse(at) >= Date.parse(stop.startedAt) && Date.parse(at) <= Date.parse(stop.endedAt);
  const stops: TrackingTimelineItem[] = data.stops.filter((stop) => available(stop.startedAt)).map((stop) => {
    const related = orders.filter((event) => event.status === 'CAPTURED' && insideStop(event.capturedAt, stop) && nearby(event, stop));
    const count = (kind: 'CREATED' | 'SUBMITTED') => new Set(related.filter((event) => event.eventType === kind).map((event) => event.order.guid || event.id)).size;
    const created = count('CREATED');
    const submitted = count('SUBMITTED');
    const incomplete = Boolean(data.orderEventsNextCursor) && Date.parse(stop.endedAt) >= watermark;
    const activity = [created ? `Создано: ${created}` : '', submitted ? `Отправлено: ${submitted}` : '', incomplete ? 'События загружены частично' : ''].filter(Boolean).join(' · ');
    return {
      key: `stop-${stop.startedAt}`, at: stop.startedAt, icon: 'pause-circle-outline', color: '#D97706',
      title: `Остановка ${Math.max(1, Math.round(stop.durationSeconds / 60))} мин`,
      subtitle: `${trackingTime(stop.startedAt)}–${trackingTime(stop.endedAt)}${activity ? ` · ${activity}` : ''}`,
      orderGuid: null, latitude: stop.latitude, longitude: stop.longitude,
    };
  });
  const points: TrackingTimelineItem[] = data.polyline.filter((point) => available(point.recordedAt)
    && !data.stops.some((stop) => insideStop(point.recordedAt, stop) && nearby(point, stop))
    // Only already-earlier orders can absorb a fix. A later page must not remove
    // the currently selected fix just before its first newly loaded order.
    && !orders.some((event) => {
      const delta = Date.parse(point.recordedAt) - Date.parse(event.capturedAt);
      return delta >= 0 && delta <= 15_000 && nearby(event, point);
    }))
    .map((point) => ({
      key: `point-${point.id}`, at: point.recordedAt, icon: 'map-marker-outline', color: '#2563EB',
      title: 'Точка маршрута', subtitle: point.accuracy != null ? `Точность ±${Math.round(point.accuracy)} м` : 'Координата записана',
      latitude: point.latitude, longitude: point.longitude, orderGuid: null,
    }));
  return [...stops, ...points, ...orders.map((event): TrackingTimelineItem => ({
    key: event.id, at: event.capturedAt,
    icon: event.eventType === 'CREATED' ? 'file-document-outline' : 'cloud-upload-outline',
    color: event.status === 'CAPTURED' ? '#16A34A' : '#94A3B8',
    title: event.eventType === 'CREATED' ? 'Создан заказ' : 'Заказ отправлен',
    subtitle: `${event.order.number || 'Черновик'} · ${event.order.counterpartyName} · ${money(event.order.totalAmount)}${event.latitude == null || event.longitude == null ? ' · Без координат' : ''}`,
    orderGuid: event.order.guid || null, latitude: event.latitude, longitude: event.longitude,
  }))].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.key.localeCompare(b.key));
}
