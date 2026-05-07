import type {
  OnecLpAppDeparturePoint,
  OnecLpAppDeparturePointPreset,
} from '@/utils/onecLpAppService';

export type TransportTaskDeparturePoint = OnecLpAppDeparturePoint & {
  id: 'departure-0';
  kind: 'departure';
};

export type TransportTaskDeparturePreset = OnecLpAppDeparturePointPreset;

export type TransportTaskCoordinatePoint = {
  latitude: number;
  longitude: number;
  address?: string | null;
};

export function toTransportTaskDeparturePoint(
  point: OnecLpAppDeparturePoint | null | undefined
): TransportTaskDeparturePoint | null {
  if (!point) return null;
  return {
    ...point,
    id: 'departure-0',
    kind: 'departure',
  };
}
