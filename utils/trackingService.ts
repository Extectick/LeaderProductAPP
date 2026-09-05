import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';

export type RouteStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type RoutePointDto = {
  id: number;
  routeId?: number;
  latitude: number;
  longitude: number;
  recordedAt: string;
  recordedTimeZone?: string | null;
  recordedTimezoneOffsetMinutes?: number | null;
  eventType: 'MOVE' | 'STOP';
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  stayDurationSeconds?: number | null;
  sequence?: number | null;
};

export type RouteWithPoints = {
  id: number;
  status: RouteStatus;
  startedAt: string;
  endedAt: string | null;
  points: RoutePointDto[];
};

export type RoutesWithPointsResponse = {
  user: { id: number };
  routes: RouteWithPoints[];
};

export type RoutesWithPointsQuery = {
  from?: string;
  to?: string;
  maxAccuracy?: string | number;
  maxPoints?: string | number;
};

function buildQuery(params?: RoutesWithPointsQuery): string {
  const search = new URLSearchParams();
  if (!params) return '';

  const add = (key: string, value?: string | number) => {
    if (value === undefined || value === null) return;
    const str = String(value).trim();
    if (str) search.set(key, str);
  };

  add('from', params.from);
  add('to', params.to);
  add('maxAccuracy', params.maxAccuracy);
  add('maxPoints', params.maxPoints);

  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchUserRoutesWithPoints(
  userId: number,
  params?: RoutesWithPointsQuery
): Promise<RoutesWithPointsResponse> {
  const query = buildQuery(params);
  const path = `${API_ENDPOINTS.TRACKING.ADMIN_USER_ROUTES_WITH_POINTS(userId)}${query}`;

  const res = await apiClient<void, RoutesWithPointsResponse>(path);
  if (!res.ok || !res.data) {
    throw new Error(res.message || 'Не удалось загрузить маршруты');
  }
  return res.data;
}

export type TrackingV2User = {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  email?: string | null;
  department?: { id: number; name: string } | null;
  tracking?: { enabled: boolean; lastUploadAt?: string | null; stale: boolean } | null;
};

export type TrackingDayPoint = {
  id: number;
  latitude: number;
  longitude: number;
  recordedAt: string;
  accuracy?: number | null;
  speed?: number | null;
  batteryLevel?: number | null;
};

export type TrackingDayData = {
  day: string;
  timezoneOffsetMinutes: number;
  summary: {
    pointsCount: number;
    distanceMeters: number;
    movingSeconds: number;
    startedAt?: string | null;
    endedAt?: string | null;
    stopsCount: number;
    ordersCount: number;
    truncated: boolean;
  };
  polyline: TrackingDayPoint[];
  stops: Array<{
    latitude: number;
    longitude: number;
    startedAt: string;
    endedAt: string;
    durationSeconds: number;
  }>;
  orderEvents: Array<{
    id: string;
    eventType: 'CREATED' | 'SUBMITTED';
    status: string;
    capturedAt: string;
    latitude?: number | null;
    longitude?: number | null;
    accuracy?: number | null;
    failureReason?: string | null;
    order: {
      guid?: string | null;
      number?: string | null;
      date?: string | null;
      totalAmount?: string | null;
      counterpartyName: string;
    };
  }>;
};

export type TrackingLiveData = {
  point?: (TrackingDayPoint & { ageSeconds: number; source?: string | null; isCharging?: boolean | null }) | null;
  device?: {
    enabled: boolean;
    lastUploadAt?: string | null;
    stale: boolean;
    platform?: string | null;
    appVersion?: string | null;
    deviceName?: string | null;
  } | null;
};

export async function fetchTrackingUsers(query = '') {
  const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  const response = await apiClient<void, TrackingV2User[]>(`/tracking/users${suffix}`);
  if (!response.ok || !response.data) throw new Error(response.message || 'Не удалось загрузить сотрудников');
  return response.data;
}

export async function fetchTrackingDay(userId: number, date: string) {
  const response = await apiClient<void, TrackingDayData>(
    `/tracking/users/${userId}/day?date=${encodeURIComponent(date)}`
  );
  if (!response.ok || !response.data) throw new Error(response.message || 'Не удалось загрузить маршрут за день');
  return response.data;
}

export async function fetchTrackingLive(userId: number) {
  const response = await apiClient<void, TrackingLiveData>(`/tracking/users/${userId}/live`);
  if (!response.ok || !response.data) throw new Error(response.message || 'Не удалось получить текущую позицию');
  return response.data;
}

export async function requestLiveLocation(userId: number) {
  const response = await apiClient<Record<string, never>, {
    id: string;
    status: string;
    requestedAt: string;
    expiresAt: string;
    lastKnown?: TrackingDayPoint | null;
  }>(`/tracking/users/${userId}/location-requests`, { method: 'POST', body: {} });
  if (!response.ok || !response.data) throw new Error(response.message || 'Не удалось запросить геопозицию');
  return response.data;
}

export async function fetchLocationRequest(requestId: string) {
  const response = await apiClient<void, {
    id: string;
    status: 'PENDING' | 'SUCCEEDED' | 'TIMED_OUT' | 'FAILED';
    failureReason?: string | null;
    point?: TrackingDayPoint | null;
  }>(`/tracking/location-requests/${encodeURIComponent(requestId)}`);
  if (!response.ok || !response.data) throw new Error(response.message || 'Не удалось проверить запрос геопозиции');
  return response.data;
}
