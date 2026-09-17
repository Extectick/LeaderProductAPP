import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import type { TrackingDayData, TrackingLiveData } from '@/utils/trackingService';

const EMPTY_STYLE = { version: 8 as const, sources: {}, layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#EEF2F7' } }] };
type TrackingMapFocus = { key: string; latitude: number; longitude: number } | null;

export default function TrackingMap({ data, live, focus, fitRevision = 0, bottomInset = 0 }: {
  data?: TrackingDayData | null;
  live?: TrackingLiveData | null;
  focus?: TrackingMapFocus;
  fitRevision?: number;
  bottomInset?: number;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim() || EMPTY_STYLE,
      center: [73.3686, 54.9893],
      zoom: 12,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'route-line', source: 'route', type: 'line', paint: { 'line-color': '#2563EB', 'line-width': 5 } });
      setReady(true);
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => { observer.disconnect(); mapRef.current = null; map.remove(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focus) return;
    const element = document.createElement('div');
    Object.assign(element.style, { width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(37,99,235,0.18)', border: '3px solid #2563EB', boxShadow: '0 0 0 2px white', pointerEvents: 'none' });
    const marker = new maplibregl.Marker({ element }).setLngLat([focus.longitude, focus.latitude]).addTo(map);
    return () => { marker.remove(); };
  }, [ready, focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const points = data?.polyline || [];
    (map.getSource('route') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: points.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map((point) => [point.longitude, point.latitude]) } }] : [],
    });
    const markers: maplibregl.Marker[] = [];
    const addMarker = (lng: number, lat: number, color: string) => markers.push(new maplibregl.Marker({ color }).setLngLat([lng, lat]).addTo(map));
    (data?.stops || []).forEach((stop) => addMarker(stop.longitude, stop.latitude, '#D97706'));
    (data?.orderEvents || []).forEach((event) => { if (event.latitude != null && event.longitude != null) addMarker(event.longitude, event.latitude, '#16A34A'); });
    if (live?.point) addMarker(live.point.longitude, live.point.latitude, '#DC2626');
    return () => markers.forEach((marker) => marker.remove());
  }, [ready, data, live]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const points = data?.polyline || [];
    const padding = { top: 70, right: 60, bottom: bottomInset + 46, left: 30 };
    if (!focus && points.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      points.forEach((point) => bounds.extend([point.longitude, point.latitude]));
      map.fitBounds(bounds, { padding, maxZoom: 15, duration: 350 });
    } else {
      const point = focus || live?.point || points[0];
      if (point) map.easeTo({ center: [point.longitude, point.latitude], zoom: focus ? 15 : 12, padding, duration: 350 });
    }
    const ornaments = container.current?.querySelector<HTMLElement>('.maplibregl-ctrl-bottom-right');
    if (ornaments) ornaments.style.bottom = `${bottomInset + 6}px`;
  }, [ready, data, live, focus, fitRevision, bottomInset]);

  return <div ref={container} style={{ width: '100%', height: '100%', minHeight: 0, background: '#EEF2F7' }} />;
}
