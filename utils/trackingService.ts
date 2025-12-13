import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';

export type RouteStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type RoutePointDto = {
  id: number;
  routeId?: number;
  latitude: number;
  longitude: number;
  recordedAt: string;
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
