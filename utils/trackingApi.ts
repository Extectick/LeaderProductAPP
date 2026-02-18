import { apiClient } from './apiClient';

export type TrackingPointInput = {
  latitude: number;
  longitude: number;
  recordedAt: string; // ISO string
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
