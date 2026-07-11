import { apiClient } from './apiClient';

export type TrackingPointInput = {
  clientPointId?: string;
  latitude: number;
  longitude: number;
  recordedAt: string; // ISO string
  recordedTimeZone?: string;
  recordedTimezoneOffsetMinutes?: number;
  eventType?: 'MOVE' | 'STOP';
  accuracy?: number;
  speed?: number;
  heading?: number;
  stayDurationSeconds?: number;
};

export type SaveTrackingPointsRequest = {
  routeId?: number;
  startNewRoute?: boolean;
  endRoute?: boolean;
  points: TrackingPointInput[];
};

export type SaveTrackingPointsResponse = {
  ok: boolean;
  message?: string;
  data?: {
    routeId: number;
    createdPoints: number;
    routeStatus: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  };
  error?: {
    code?: string;
    details?: any;
  };
};

export type TrackingRouteStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type TrackingSession = {
  id: number;
  status: TrackingRouteStatus;
  startedAt: string;
  endedAt?: string | null;
  pointsCount?: number;
};

export type TrackingStatus = {
  serverTime: string;
  activeRoute: TrackingSession | null;
  lastRoute: TrackingSession | null;
  lastPoint: TrackingPointInput | null;
  activePointsCount: number;
  todayPointsCount: number;
};

export type NativeTrackingTokenRequest = {
  installId?: string;
  deviceSessionId?: string | null;
  platform?: string;
  appVersion?: string;
  deviceName?: string;
};

export type NativeTrackingTokenResponse = {
  token: string;
  expiresAt: string;
  endpoint: string;
};

export async function sendTrackingPoints(
  body: SaveTrackingPointsRequest
): Promise<{ ok: boolean; data?: SaveTrackingPointsResponse; message?: string; status?: number }> {
  const response = await apiClient<SaveTrackingPointsRequest, SaveTrackingPointsResponse>('/tracking/points', {
    method: 'POST',
    body,
  });
  return {
    ok: response.ok,
    data: response.data,
    message: response.message,
    status: response.status,
  };
}

export async function startTrackingSession(): Promise<{
  ok: boolean;
  route?: TrackingSession;
  message?: string;
  status?: number;
}> {
  const response = await apiClient<{}, { route: TrackingSession }>('/tracking/sessions/start', {
    method: 'POST',
    body: {},
  });
  return {
    ok: response.ok,
    route: response.data?.route,
    message: response.message,
    status: response.status,
  };
}

export async function stopTrackingSession(routeId?: number): Promise<{
  ok: boolean;
  route?: TrackingSession | null;
  message?: string;
  status?: number;
}> {
  const response = await apiClient<{ routeId?: number }, { route: TrackingSession | null }>('/tracking/sessions/stop', {
    method: 'POST',
    body: routeId ? { routeId } : {},
  });
  return {
    ok: response.ok,
    route: response.data?.route,
    message: response.message,
    status: response.status,
  };
}

export async function getTrackingStatus(): Promise<{
  ok: boolean;
  data?: TrackingStatus;
  message?: string;
  status?: number;
}> {
  const response = await apiClient<undefined, TrackingStatus>('/tracking/status');
  return {
    ok: response.ok,
    data: response.data,
    message: response.message,
    status: response.status,
  };
}

export async function issueNativeTrackingToken(
  body: NativeTrackingTokenRequest
): Promise<{
  ok: boolean;
  data?: NativeTrackingTokenResponse;
  message?: string;
  status?: number;
}> {
  const response = await apiClient<NativeTrackingTokenRequest, NativeTrackingTokenResponse>('/tracking/native-token', {
    method: 'POST',
    body,
  });
  return {
    ok: response.ok,
    data: response.data,
    message: response.message,
    status: response.status,
  };
}

export async function revokeNativeTrackingToken(
  body: NativeTrackingTokenRequest & { token?: string }
): Promise<{
  ok: boolean;
  data?: { revoked: number };
  message?: string;
  status?: number;
}> {
  const response = await apiClient<NativeTrackingTokenRequest & { token?: string }, { revoked: number }>(
    '/tracking/native-token',
    {
      method: 'DELETE',
      body,
    }
  );
  return {
    ok: response.ok,
    data: response.data,
    message: response.message,
    status: response.status,
  };
}
