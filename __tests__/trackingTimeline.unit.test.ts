import type { TrackingDayData } from '../utils/trackingService';
import { buildTrackingTimeline } from '../src/features/tracking/trackingTimeline';

const at = (minute: number) => `2026-09-16T06:${String(minute).padStart(2, '0')}:00Z`;
const stop = { startedAt: at(10), endedAt: at(30), durationSeconds: 1200, latitude: 55, longitude: 73 };
const event = (id: string, minute: number, extra = {}): TrackingDayData['orderEvents'][number] => ({
  id, capturedAt: at(minute), eventType: 'CREATED', status: 'CAPTURED', latitude: 55, longitude: 73,
  order: { guid: id, number: id, counterpartyName: 'Клиент', totalAmount: '500' }, ...extra,
});
const data = (extra: Partial<TrackingDayData> = {}): TrackingDayData => ({
  day: '2026-09-16', timezoneOffsetMinutes: 360, summary: { pointsCount: 3, distanceMeters: 100, movingSeconds: 60, stopsCount: 1, ordersCount: 0, truncated: false },
  polyline: [0, 20, 40].map((minute) => ({ id: minute, recordedAt: at(minute), latitude: 55, longitude: 73 })),
  stops: [stop], orderEvents: [], ...extra,
});

it('orders points/stops/documents by time and folds GPS fixes inside a stop', () => {
  const result = buildTrackingTimeline(data({ orderEvents: [event('created', 15), event('submitted', 25, { eventType: 'SUBMITTED' })] }));
  expect(result.map((row) => row.key)).toEqual(['point-0', `stop-${at(10)}`, 'created', 'submitted', 'point-40']);
  expect(result[1].title).toBe('Остановка 20 мин');
  expect(result[1].subtitle).toContain('Создано: 1 · Отправлено: 1');
});

it('does not attach an order elsewhere or without coordinates to the stop', () => {
  const result = buildTrackingTimeline(data({ orderEvents: [event('far', 15, { latitude: 56 }), event('unknown', 16, { latitude: null, longitude: null })] }));
  expect(result.find((row) => row.key.startsWith('stop-'))!.subtitle).not.toContain('Создано');
  expect(result.find((row) => row.key === 'unknown')!.subtitle).toContain('Без координат');
});

it('counts each document once per activity and keeps unfinished counts explicit', () => {
  const a = event('a', 15);
  const result = buildTrackingTimeline(data({ orderEvents: [a, { ...a, id: 'retry', capturedAt: at(16) }], orderEventsNextCursor: 'next' }));
  expect(result.find((row) => row.key.startsWith('stop-'))!.subtitle).toContain('Создано: 1');
  expect(result.find((row) => row.key.startsWith('stop-'))!.subtitle).toContain('частично');
  expect(result.some((row) => row.key === 'point-40')).toBe(false);
});

it('does not invent an activity or waiting time between sparse GPS fixes', () => {
  const result = buildTrackingTimeline(data({ stops: [] }));
  expect(result).toHaveLength(3);
  expect(result.every((row) => row.title === 'Точка маршрута')).toBe(true);
  expect(buildTrackingTimeline(null)).toEqual([]);
});

it('suppresses a redundant GPS fix next to a document coordinate', () => {
  expect(buildTrackingTimeline(data({ stops: [], orderEvents: [event('a', 20)] })).map((row) => row.key)).toEqual(['point-0', 'a', 'point-40']);
});

it('keeps a fix before a newly loaded order stable across pagination', () => {
  const point = { id: 7, recordedAt: '2026-09-16T06:19:55Z', latitude: 55, longitude: 73 };
  const previous = event('a', 0, { capturedAt: '2026-09-16T06:19:58Z', latitude: 56 });
  const first = data({ stops: [], polyline: [point], orderEvents: [previous], orderEventsNextCursor: 'next' });
  expect(buildTrackingTimeline(first)[0].key).toBe('point-7');
  expect(buildTrackingTimeline({ ...first, orderEvents: [previous, event('b', 20)], orderEventsNextCursor: null })[0].key).toBe('point-7');
});
