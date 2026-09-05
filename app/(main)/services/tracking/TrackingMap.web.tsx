import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';

import type { TrackingDayData, TrackingLiveData } from '@/utils/trackingService';

const EMPTY_STYLE = { version: 8 as const, sources: {}, layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#EEF2F7' } }] };
type TrackingMapFocus = { key: string; latitude: number; longitude: number } | null;

export default function TrackingMap({ data, live, focus }: {
  data?: TrackingDayData | null;
  live?: TrackingLiveData | null;
  focus?: TrackingMapFocus;
}) {
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const points = data?.polyline || [];
    const center: [number, number] = focus
      ? [focus.longitude, focus.latitude]
      : live?.point
      ? [live.point.longitude, live.point.latitude]
      : points.length ? [points[points.length - 1].longitude, points[points.length - 1].latitude] : [73.3686, 54.9893];
    const configuredStyle = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim();
    const map = new maplibregl.Map({
      container: container.current,
      style: configuredStyle || EMPTY_STYLE,
      center,
      zoom: focus ? 15 : 12,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('load', () => {
      if (points.length > 1) {
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map((point) => [point.longitude, point.latitude]) } } });
        map.addLayer({ id: 'route-line', source: 'route', type: 'line', paint: { 'line-color': '#2563EB', 'line-width': 5 } });
        const bounds = new maplibregl.LngLatBounds();
        points.forEach((point) => bounds.extend([point.longitude, point.latitude]));
        if (!focus) map.fitBounds(bounds, { padding: 48, maxZoom: 15 });
      }
      (data?.stops || []).forEach((stop) => new maplibregl.Marker({ color: '#F59E0B' }).setLngLat([stop.longitude, stop.latitude]).addTo(map));
      (data?.orderEvents || []).filter((event) => event.latitude != null && event.longitude != null)
        .forEach((event) => new maplibregl.Marker({ color: '#16A34A' }).setLngLat([event.longitude!, event.latitude!]).addTo(map));
      if (live?.point) new maplibregl.Marker({ color: '#DC2626' }).setLngLat([live.point.longitude, live.point.latitude]).addTo(map);
    });
    return () => map.remove();
  }, [data, focus, live]);

  return <div ref={container} style={{ width: '100%', height: '100%', minHeight: 320, background: '#EEF2F7' }} />;
}
