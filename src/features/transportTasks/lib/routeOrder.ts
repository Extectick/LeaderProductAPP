import type { OnecLpAppRoutePoint } from '@/utils/onecLpAppService';
import type { TransportTaskCoordinatePoint, TransportTaskDeparturePoint } from '../types';

export function routeOrderKey(route?: OnecLpAppRoutePoint[] | null) {
  return (route ?? []).map((point) => point.linkKey).join('|');
}

export function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= items.length) return items;
  const nextIndex = Math.max(0, Math.min(items.length - 1, toIndex));
  if (fromIndex === nextIndex) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

export function isFinitePointCoordinate(point: OnecLpAppRoutePoint) {
  return (
    typeof point.latitude === 'number' &&
    typeof point.longitude === 'number' &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude)
  );
}

function distanceSquared(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const lat = a.latitude - b.latitude;
  const lon = a.longitude - b.longitude;
  return lat * lat + lon * lon;
}

export function optimizeRouteNearestNeighbor(
  route: OnecLpAppRoutePoint[],
  departurePoint?: TransportTaskDeparturePoint | null
) {
  if (route.length < 3) return route;
  const withCoordinates = route.filter(isFinitePointCoordinate);
  const withoutCoordinates = route.filter((point) => !isFinitePointCoordinate(point));
  if (withCoordinates.length < 2) return route;

  const ordered: OnecLpAppRoutePoint[] = [];
  const remaining = [...withCoordinates];
  let current: { latitude: number; longitude: number } =
    departurePoint && typeof departurePoint.latitude === 'number' && typeof departurePoint.longitude === 'number'
      ? { latitude: departurePoint.latitude, longitude: departurePoint.longitude }
      : { latitude: withCoordinates[0].latitude as number, longitude: withCoordinates[0].longitude as number };

  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = distanceSquared(current, {
      latitude: remaining[0].latitude as number,
      longitude: remaining[0].longitude as number,
    });
    for (let index = 1; index < remaining.length; index += 1) {
      const distance = distanceSquared(current, {
        latitude: remaining[index].latitude as number,
        longitude: remaining[index].longitude as number,
      });
      if (distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    current = { latitude: next.latitude as number, longitude: next.longitude as number };
  }

  return [...ordered, ...withoutCoordinates];
}

export function resolveDraftMapPoint(point?: TransportTaskDeparturePoint | null): TransportTaskCoordinatePoint | null {
  if (!point) return null;
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    address: point.address,
  };
}
