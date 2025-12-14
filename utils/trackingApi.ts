import { authFetch } from './authFetch';
import { API_BASE_URL } from './config';

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
  routeId: number;
  createdPoints: number;
  routeStatus: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
};

export async function sendTrackingPoints(
  body: SaveTrackingPointsRequest
): Promise<{ ok: boolean; data?: SaveTrackingPointsResponse; message?: string; status?: number }> {
  return authFetch<SaveTrackingPointsRequest, SaveTrackingPointsResponse>(
    `${API_BASE_URL}/tracking/points`,
    {
      method: 'POST',
      body,
    }
  );
}
