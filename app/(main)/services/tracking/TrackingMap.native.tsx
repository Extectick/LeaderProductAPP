import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';

import type { TrackingDayData, TrackingLiveData } from '@/utils/trackingService';

const EMPTY_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#EEF2F7' } }],
};
type TrackingMapFocus = { key: string; latitude: number; longitude: number } | null;

export default function TrackingMap({ data, live, focus }: {
  data?: TrackingDayData | null;
  live?: TrackingLiveData | null;
  focus?: TrackingMapFocus;
}) {
  const points = data?.polyline || [];
  const center = focus
    ? [focus.longitude, focus.latitude] as [number, number]
    : live?.point
    ? [live.point.longitude, live.point.latitude] as [number, number]
    : points.length
      ? [points[points.length - 1].longitude, points[points.length - 1].latitude] as [number, number]
      : [73.3686, 54.9893] as [number, number];
  const bounds = useMemo<[number, number, number, number] | undefined>(() => {
    if (points.length < 2) return undefined;
    const lng = points.map((point) => point.longitude);
    const lat = points.map((point) => point.latitude);
    return [Math.min(...lng), Math.min(...lat), Math.max(...lng), Math.max(...lat)];
  }, [points]);
  const line = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: points.map((point) => [point.longitude, point.latitude]) },
  }), [points]);
  const stops = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: (data?.stops || []).map((stop, index) => ({
      type: 'Feature' as const,
      id: `stop-${index}`,
      properties: { duration: stop.durationSeconds },
      geometry: { type: 'Point' as const, coordinates: [stop.longitude, stop.latitude] },
    })),
  }), [data?.stops]);
  const orders = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: (data?.orderEvents || []).filter((event) => event.latitude != null && event.longitude != null).map((event) => ({
      type: 'Feature' as const,
      id: event.id,
      properties: { eventType: event.eventType },
      geometry: { type: 'Point' as const, coordinates: [event.longitude!, event.latitude!] },
    })),
  }), [data?.orderEvents]);
  const livePoint = live?.point ? {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Point' as const, coordinates: [live.point.longitude, live.point.latitude] },
  } : null;

  const configuredStyle = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim();
  return (
    <View style={styles.root}>
      <Map style={StyleSheet.absoluteFill} mapStyle={configuredStyle || EMPTY_STYLE}>
        <Camera
          initialViewState={!focus && bounds ? { bounds, padding: { top: 36, right: 36, bottom: 36, left: 36 } } : { center, zoom: focus ? 15 : 12 }}
        />
        {points.length > 1 ? (
          <GeoJSONSource id="route" data={line}>
            <Layer id="route-line" type="line" paint={{ 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 0.9 }} />
          </GeoJSONSource>
        ) : null}
        <GeoJSONSource id="stops" data={stops}>
          <Layer id="stop-points" type="circle" paint={{ 'circle-color': '#F59E0B', 'circle-radius': 7, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 }} />
        </GeoJSONSource>
        <GeoJSONSource id="orders" data={orders}>
          <Layer id="order-points" type="circle" paint={{ 'circle-color': '#16A34A', 'circle-radius': 8, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }} />
        </GeoJSONSource>
        {livePoint ? (
          <GeoJSONSource id="live" data={livePoint}>
            <Layer id="live-point" type="circle" paint={{ 'circle-color': '#DC2626', 'circle-radius': 9, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }} />
          </GeoJSONSource>
        ) : null}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, minHeight: 280, backgroundColor: '#EEF2F7' } });
