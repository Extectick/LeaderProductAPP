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
  nativeDevice?: {
    active: boolean;
    installId?: string | null;
    platform?: string | null;
    appVersion?: string | null;
    lastUploadAt?: string | null;
    tokenExpiresAt?: string | null;
    stale: boolean;
    tokenIssueCountLastHour: number;
  } | null;
};

export type NativeTrackingTokenRequest = {
  installId?: string;
  deviceSessionId?: string | null;
  platform?: string;
  appVersion?: string;
  deviceName?: string;
  reason?: 'start' | 'repair' | 'token_invalid';
};

export type NativeTrackingTokenResponse = {
  token: string;
  expiresAt: string;
  endpoint: string;
};

export type TrackingAdminHealth = {
  serverTime: string;
  thresholds: { staleAfterMinutes: number };
  summary: {
    activeDevices: number;
    staleDevices: number;
    tokenIssuesLastHour: number;
  };
  devices: Array<{
    id: number;
    user: {
      id: number;
      firstName?: string | null;
      lastName?: string | null;
      middleName?: string | null;
      email?: string | null;
    };
    platform?: string | null;
    appVersion?: string | null;
    issueReason?: string | null;
    createdAt: string;
    lastUploadAt?: string | null;
    expiresAt?: string | null;
    stale: boolean;
  }>;
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

export async function getTrackingAdminHealth(limit = 30): Promise<{
  ok: boolean;
  data?: TrackingAdminHealth;
  message?: string;
  status?: number;
}> {
  const response = await apiClient<undefined, TrackingAdminHealth>(
    `/tracking/admin/health?limit=${Math.min(200, Math.max(1, Math.floor(limit)))}`
  );
  return {
    ok: response.ok,
    data: response.data,
    message: response.message,
    status: response.status,
  };
}
