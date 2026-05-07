import type { OnecLpAppRoutePoint } from '@/utils/onecLpAppService';
import type { TransportTaskCoordinatePoint, TransportTaskDeparturePoint } from './types';
import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View, type DimensionValue } from 'react-native';
import { Text } from 'react-native-paper';
import { WebView } from 'react-native-webview';

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const LEAFLET_NATIVE_BASE_URL = 'https://www.openstreetmap.org/';
const MAP_USER_AGENT = 'LeaderProductAPP/1.0';

type MapPoint = {
  sourceIndex: number;
  order: number;
  kind: 'departure' | 'route';
  latitude: number;
  longitude: number;
  displayLatitude: number;
  displayLongitude: number;
  address?: string | null;
};

type MapViewport = {
  center: {
    latitude: number;
    longitude: number;
  };
  zoom: number;
};

type ViewportMode = 'auto' | 'preserve' | 'focus-selected' | 'focus-departure';

type Props = {
  route?: OnecLpAppRoutePoint[] | null;
  departurePoint?: TransportTaskDeparturePoint | null;
  draftDeparturePoint?: TransportTaskCoordinatePoint | null;
  height?: DimensionValue;
  selectedIndex?: number | null;
  onSelectIndex?: (index: number) => void;
  editing?: boolean;
  saving?: boolean;
  onMoveToPosition?: (fromIndex: number, position: number) => void;
  departurePickMode?: boolean;
  onPickDeparturePoint?: (point: TransportTaskCoordinatePoint) => void;
  onPressDeparturePoint?: () => void;
  onMapTap?: () => void;
  focusSelectedCounter?: number;
  focusDepartureCounter?: number;
  showHeader?: boolean;
  framed?: boolean;
};

function isFiniteCoordinate(latitude: unknown, longitude: unknown): latitude is number {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function buildMapPoints(
  route: OnecLpAppRoutePoint[] = [],
  departurePoint?: TransportTaskDeparturePoint | null
): MapPoint[] {
  const duplicateCounts = new Map<string, number>();
  const points: MapPoint[] = [];

  const pushPoint = (params: {
    sourceIndex: number;
    order: number;
    kind: 'departure' | 'route';
    latitude: number;
    longitude: number;
    address?: string | null;
  }) => {
    const key = `${params.latitude.toFixed(6)}:${params.longitude.toFixed(6)}`;
    const duplicateIndex = duplicateCounts.get(key) ?? 0;
    duplicateCounts.set(key, duplicateIndex + 1);

    const angle = duplicateIndex * 0.95;
    const radius = duplicateIndex === 0 ? 0 : 0.000055 + duplicateIndex * 0.000012;

    points.push({
      sourceIndex: params.sourceIndex,
      order: params.order,
      kind: params.kind,
      latitude: params.latitude,
      longitude: params.longitude,
      displayLatitude: params.latitude + Math.sin(angle) * radius,
      displayLongitude: params.longitude + Math.cos(angle) * radius,
      address: params.address,
    });
  };

  if (departurePoint && isFiniteCoordinate(departurePoint.latitude, departurePoint.longitude)) {
    pushPoint({
      sourceIndex: -1,
      order: 0,
      kind: 'departure',
      latitude: departurePoint.latitude,
      longitude: departurePoint.longitude,
      address: departurePoint.address,
    });
  }

  route.forEach((point, index) => {
    if (!isFiniteCoordinate(point.latitude, point.longitude)) return;
    pushPoint({
      sourceIndex: index,
      order: index + 1,
      kind: 'route',
      latitude: point.latitude,
      longitude: point.longitude as number,
      address: point.address,
    });
  });

  return points;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildHtml(
  points: MapPoint[],
  selectedIndex?: number | null,
  editing?: boolean,
  saving?: boolean,
  departurePickMode?: boolean,
  draftDeparturePoint?: TransportTaskCoordinatePoint | null,
  viewportMode: ViewportMode = 'auto',
  initialViewport?: MapViewport | null
) {
  const encoded = JSON.stringify(points);
  const selected = selectedIndex ?? -1;
  const isEditing = editing ? 'true' : 'false';
  const isSaving = saving ? 'true' : 'false';
  const isDeparturePickMode = departurePickMode ? 'true' : 'false';
  const encodedDraftPoint = JSON.stringify(draftDeparturePoint ?? null);
  const encodedInitialViewport = JSON.stringify(initialViewport ?? null);
  const encodedViewportMode = JSON.stringify(viewportMode);

  return `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .leaflet-control-attribution { font-size: 10px; }
      .route-marker {
        width: 30px;
        height: 30px;
        border-radius: 15px;
        background: #2563eb;
        border: 2px solid #ffffff;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 900;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.28);
        transform: scale(1);
        transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease, width 160ms ease, height 160ms ease;
        cursor: pointer;
      }
      .route-marker:hover {
        transform: scale(1.12);
        box-shadow: 0 12px 24px rgba(37, 99, 235, 0.26);
      }
      .route-marker:active {
        transform: scale(0.94);
        transition-duration: 90ms;
      }
      .route-marker-selected {
        background: #dc2626;
        width: 34px;
        height: 34px;
        border-radius: 17px;
        font-size: 14px;
      }
      .route-marker-departure {
        background: #d97706;
        width: 34px;
        height: 34px;
        border-radius: 17px;
        font-size: 14px;
      }
      .route-marker-draft {
        background: #ea580c;
        width: 38px;
        height: 38px;
        border-radius: 19px;
        font-size: 14px;
        box-shadow: 0 14px 32px rgba(234, 88, 12, 0.35);
      }
      .route-marker-editing {
        background: #16a34a;
        border-color: #ffffff;
        transform: scale(1.12);
        box-shadow: 0 12px 24px rgba(22, 163, 74, 0.3);
      }
      .route-marker-input {
        width: 20px;
        height: 20px;
        border: 0;
        outline: none;
        background: transparent;
        color: #ffffff;
        font-size: 13px;
        font-weight: 900;
        text-align: center;
        padding: 0;
        margin: 0;
      }
      .route-marker-selected .route-marker-input {
        font-size: 14px;
      }
      .route-tooltip {
        font-size: 12px;
        font-weight: 700;
        color: #0f172a;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const points = ${encoded};
      const selected = ${selected};
      const editing = ${isEditing};
      const saving = ${isSaving};
      const departurePickMode = ${isDeparturePickMode};
      const draftDeparturePoint = ${encodedDraftPoint};
      const initialViewport = ${encodedInitialViewport};
      const viewportMode = ${encodedViewportMode};
      const map = L.map('map', { zoomControl: true });
      L.tileLayer('${OSM_TILE_URL}', {
        attribution: '${OSM_TILE_ATTRIBUTION}',
        maxZoom: 19,
      }).addTo(map);

      const sendPayload = (payload) => {
        const encodedPayload = JSON.stringify(payload);
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(encodedPayload);
          }
        } catch (e) {}
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(encodedPayload, '*');
          }
        } catch (e) {}
      };
      const sendSelect = (sourceIndex) => sendPayload({ type: 'transport_route_point_select', sourceIndex });
      const sendDeparturePress = () => sendPayload({ type: 'transport_departure_point_press' });
      const sendMoveTo = (sourceIndex, position) => sendPayload({ type: 'transport_route_point_move_to', sourceIndex, position });
      const sendMapTap = () => sendPayload({ type: 'transport_map_tap' });
      const sendDeparturePick = (latitude, longitude) => sendPayload({
        type: 'transport_departure_point_pick',
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
      });
      const sendViewport = () => {
        const center = map.getCenter();
        sendPayload({
          type: 'transport_map_viewport',
          latitude: Number(center.lat.toFixed(6)),
          longitude: Number(center.lng.toFixed(6)),
          zoom: map.getZoom(),
        });
      };
      const escapeText = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      let activeEditorCleanup = null;

      const markerHtml = (point, isSelected) =>
        '<div class="route-marker ' +
        (point.kind === 'departure' ? 'route-marker-departure ' : '') +
        (isSelected ? 'route-marker-selected' : '') +
        '" data-marker-number="true">' +
        point.order +
        '</div>';

      const draftMarkerHtml = () =>
        '<div class="route-marker route-marker-draft" data-marker-number="true">0</div>';

      let draftMarker = null;
      const setDraftMarker = (latitude, longitude) => {
        const latLng = [latitude, longitude];
        if (draftMarker) {
          draftMarker.setLatLng(latLng);
          return;
        }
        const draftIcon = L.divIcon({
          className: '',
          html: draftMarkerHtml(),
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });
        draftMarker = L.marker(latLng, {
          icon: draftIcon,
          title: '0',
        }).addTo(map);
        draftMarker.bindTooltip('${escapeHtml('Черновик точки отправления')}', {
          direction: 'top',
          offset: [0, -18],
          opacity: 0.92,
          className: 'route-tooltip',
        });
      };

      if (draftDeparturePoint && Number.isFinite(draftDeparturePoint.latitude) && Number.isFinite(draftDeparturePoint.longitude)) {
        setDraftMarker(draftDeparturePoint.latitude, draftDeparturePoint.longitude);
      }

      map.on('moveend', sendViewport);

      if (points.length > 0) {
        const realLatLngs = points.map((p) => L.latLng(p.latitude, p.longitude));
        const displayLatLngs = points.map((p) => L.latLng(p.displayLatitude, p.displayLongitude));
        const line = L.polyline(realLatLngs, { color: '#2563eb', weight: 4, opacity: 0.75 }).addTo(map);

        points.forEach((point, index) => {
          const isSelected = point.sourceIndex >= 0 && point.sourceIndex === selected;
          const icon = L.divIcon({
            className: '',
            html: markerHtml(point, isSelected),
            iconSize: point.kind === 'departure' || isSelected ? [34, 34] : [30, 30],
            iconAnchor: point.kind === 'departure' || isSelected ? [17, 17] : [15, 15],
          });
          const marker = L.marker(displayLatLngs[index], { icon, title: String(point.order) }).addTo(map);
          if (point.address) {
            marker.bindTooltip(
              (point.kind === 'departure' ? '${escapeHtml('Точка отправления')}' : '${escapeHtml('Точка')}') +
                ' ' + point.order + ': ' + escapeText(point.address),
              {
                direction: 'top',
                offset: [0, -16],
                opacity: 0.9,
                className: 'route-tooltip',
              }
            );
          }
          if (point.kind === 'departure') {
            marker.on('click', () => sendDeparturePress());
          }
          if (point.kind === 'route') {
            marker.on('click', () => sendSelect(point.sourceIndex));
          }

          if (point.kind === 'route' && editing && !saving) {
            const attachMarkerEditing = () => {
              const markerElement = marker.getElement();
              const markerNumberElement = markerElement && markerElement.querySelector('[data-marker-number="true"]');
              if (!markerElement || !markerNumberElement || markerElement.dataset.routeEditBound === 'true') return;
              markerElement.dataset.routeEditBound = 'true';

              markerNumberElement.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (activeEditorCleanup) activeEditorCleanup();

                let finalized = false;
                const applyOrCancel = (apply) => {
                  if (finalized) return;
                  finalized = true;
                  const nextElement = marker.getElement();
                  if (nextElement) {
                    nextElement.innerHTML = markerHtml(point, isSelected);
                    delete nextElement.dataset.routeEditBound;
                    attachMarkerEditing();
                  }
                  activeEditorCleanup = null;
                  if (apply === null) return;
                  const parsed = Number.parseInt(String(apply), 10);
                  if (!Number.isFinite(parsed)) return;
                  const bounded = Math.max(1, Math.min(points.filter((item) => item.kind === 'route').length, parsed));
                  sendMoveTo(point.sourceIndex, bounded);
                };

                markerElement.innerHTML =
                  '<div class="route-marker ' +
                  'route-marker-editing ' +
                  (isSelected ? 'route-marker-selected' : '') +
                  '"><input class="route-marker-input" value="' +
                  point.order +
                  '" inputmode="numeric" /></div>';

                const input = markerElement.querySelector('.route-marker-input');
                if (!input) return;

                input.focus();
                input.select();

                const onBlur = () => applyOrCancel(input.value);
                const onKeyDown = (keyEvent) => {
                  keyEvent.stopPropagation();
                  if (keyEvent.key === 'Enter') {
                    keyEvent.preventDefault();
                    applyOrCancel(input.value);
                  } else if (keyEvent.key === 'Escape') {
                    keyEvent.preventDefault();
                    applyOrCancel(null);
                  }
                };
                const stopPropagation = (innerEvent) => innerEvent.stopPropagation();

                input.addEventListener('blur', onBlur, { once: true });
                input.addEventListener('keydown', onKeyDown);
                input.addEventListener('click', stopPropagation);
                input.addEventListener('mousedown', stopPropagation);
                input.addEventListener('mouseup', stopPropagation);

                activeEditorCleanup = () => {
                  input.removeEventListener('keydown', onKeyDown);
                  input.removeEventListener('click', stopPropagation);
                  input.removeEventListener('mousedown', stopPropagation);
                  input.removeEventListener('mouseup', stopPropagation);
                  const nextElement = marker.getElement();
                  if (nextElement) {
                    nextElement.innerHTML = markerHtml(point, isSelected);
                    delete nextElement.dataset.routeEditBound;
                    attachMarkerEditing();
                  }
                  activeEditorCleanup = null;
                };
              });
            };

            marker.on('add', attachMarkerEditing);
            if (typeof window !== 'undefined' && window.requestAnimationFrame) {
              window.requestAnimationFrame(attachMarkerEditing);
            } else {
              setTimeout(attachMarkerEditing, 0);
            }
          }
        });

        const departurePointIndex = points.findIndex((p) => p.kind === 'departure');
        const selectedPointIndex = points.findIndex((p) => p.sourceIndex === selected);
        if (
          viewportMode === 'preserve' &&
          initialViewport &&
          Number.isFinite(initialViewport.center?.latitude) &&
          Number.isFinite(initialViewport.center?.longitude) &&
          Number.isFinite(initialViewport.zoom)
        ) {
          map.setView([initialViewport.center.latitude, initialViewport.center.longitude], initialViewport.zoom);
        } else if (viewportMode === 'focus-selected' && selectedPointIndex >= 0) {
          map.setView(displayLatLngs[selectedPointIndex], 15);
        } else if (viewportMode === 'focus-departure' && departurePointIndex >= 0) {
          map.setView(displayLatLngs[departurePointIndex], 15);
        } else if (points.length > 1) {
          map.fitBounds(line.getBounds(), { padding: [32, 32] });
          if (draftMarker) {
            const group = L.featureGroup([line, draftMarker]);
            map.fitBounds(group.getBounds(), { padding: [32, 32] });
          }
        } else {
          map.setView(realLatLngs[0], 15);
          if (draftMarker) {
            const group = L.featureGroup([L.marker(realLatLngs[0]), draftMarker]);
            map.fitBounds(group.getBounds(), { padding: [32, 32] });
          }
        }
      } else if (draftMarker) {
        if (
          viewportMode === 'preserve' &&
          initialViewport &&
          Number.isFinite(initialViewport.center?.latitude) &&
          Number.isFinite(initialViewport.center?.longitude) &&
          Number.isFinite(initialViewport.zoom)
        ) {
          map.setView([initialViewport.center.latitude, initialViewport.center.longitude], initialViewport.zoom);
        } else {
          map.setView([draftDeparturePoint.latitude, draftDeparturePoint.longitude], 15);
        }
      } else {
        if (
          viewportMode === 'preserve' &&
          initialViewport &&
          Number.isFinite(initialViewport.center?.latitude) &&
          Number.isFinite(initialViewport.center?.longitude) &&
          Number.isFinite(initialViewport.zoom)
        ) {
          map.setView([initialViewport.center.latitude, initialViewport.center.longitude], initialViewport.zoom);
        } else {
          map.setView([55.0302, 82.9204], 10);
        }
      }

      if (departurePickMode && !saving) {
        map.on('click', (event) => {
          setDraftMarker(event.latlng.lat, event.latlng.lng);
          sendDeparturePick(event.latlng.lat, event.latlng.lng);
        });
      } else {
        map.on('click', () => {
          sendMapTap();
        });
      }
    </script>
  </body>
</html>
`;
}

export default function TransportRouteMap({
  route,
  departurePoint,
  draftDeparturePoint,
  height = 320,
  selectedIndex,
  onSelectIndex,
  editing = false,
  saving = false,
  onMoveToPosition,
  departurePickMode = false,
  onPickDeparturePoint,
  onPressDeparturePoint,
  onMapTap,
  focusSelectedCounter = 0,
  focusDepartureCounter = 0,
  showHeader = true,
  framed = true,
}: Props) {
  const iframeRef = useRef<any>(null);
  const pickModeInitialDraftRef = useRef<TransportTaskCoordinatePoint | null>(null);
  const wasDeparturePickModeRef = useRef(false);
  const viewportRef = useRef<MapViewport | null>(null);
  const previousSelectedLinkKeyRef = useRef<string | null>(null);
  const previousFocusSelectedCounterRef = useRef(focusSelectedCounter);
  const previousFocusDepartureCounterRef = useRef(focusDepartureCounter);
  const pendingFocusSelectedCounterRef = useRef<number | null>(null);
  const pendingFocusDepartureCounterRef = useRef<number | null>(null);
  if (departurePickMode && !wasDeparturePickModeRef.current) {
    pickModeInitialDraftRef.current = draftDeparturePoint ?? null;
  }
  if (!departurePickMode && wasDeparturePickModeRef.current) {
    pickModeInitialDraftRef.current = null;
  }
  wasDeparturePickModeRef.current = departurePickMode;
  const htmlDraftDeparturePoint = departurePickMode ? pickModeInitialDraftRef.current : draftDeparturePoint;
  const mapPoints = useMemo(() => buildMapPoints(route ?? [], departurePoint), [departurePoint, route]);
  const selectedLinkKey =
    selectedIndex !== null && selectedIndex !== undefined ? route?.[selectedIndex]?.linkKey ?? null : null;
  const selectedFocusRequested =
    Boolean(selectedLinkKey) &&
    (selectedLinkKey !== previousSelectedLinkKeyRef.current ||
      focusSelectedCounter !== previousFocusSelectedCounterRef.current ||
      focusSelectedCounter === pendingFocusSelectedCounterRef.current);
  const departureFocusRequested =
    selectedIndex == null &&
    (focusDepartureCounter !== previousFocusDepartureCounterRef.current ||
      focusDepartureCounter === pendingFocusDepartureCounterRef.current);
  let viewportMode: ViewportMode = 'auto';
  if (selectedFocusRequested) {
    viewportMode = 'focus-selected';
  } else if (departureFocusRequested) {
    viewportMode = 'focus-departure';
  } else if (viewportRef.current) {
    viewportMode = 'preserve';
  }
  const html = useMemo(
    () =>
      buildHtml(
        mapPoints,
        selectedIndex,
        editing,
        saving,
        departurePickMode,
        htmlDraftDeparturePoint,
        viewportMode,
        viewportRef.current
      ),
    [departurePickMode, editing, htmlDraftDeparturePoint, mapPoints, saving, selectedIndex, viewportMode]
  );
  const totalCount = (route?.length ?? 0) + (departurePoint ? 1 : 0);

  useEffect(() => {
    if (viewportMode === 'focus-selected') {
      pendingFocusSelectedCounterRef.current = focusSelectedCounter;
    }
    if (viewportMode === 'focus-departure') {
      pendingFocusDepartureCounterRef.current = focusDepartureCounter;
    }
    previousSelectedLinkKeyRef.current = selectedLinkKey;
    previousFocusSelectedCounterRef.current = focusSelectedCounter;
    previousFocusDepartureCounterRef.current = focusDepartureCounter;
  }, [focusDepartureCounter, focusSelectedCounter, selectedLinkKey, viewportMode]);

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      (!onSelectIndex && !onMoveToPosition && !onPickDeparturePoint && !onPressDeparturePoint && !onMapTap)
    ) {
      return;
    }
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      let payload: any = event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (payload?.type === 'transport_route_point_select' && Number.isInteger(payload.sourceIndex)) {
        onSelectIndex?.(payload.sourceIndex);
      }
      if (
        payload?.type === 'transport_route_point_move_to' &&
        Number.isInteger(payload.sourceIndex) &&
        Number.isInteger(payload.position)
      ) {
        onMoveToPosition?.(payload.sourceIndex, payload.position);
      }
      if (
        payload?.type === 'transport_departure_point_pick' &&
        typeof payload.latitude === 'number' &&
        typeof payload.longitude === 'number'
      ) {
        onPickDeparturePoint?.({
          latitude: payload.latitude,
          longitude: payload.longitude,
        });
      }
      if (payload?.type === 'transport_departure_point_press') {
        onPressDeparturePoint?.();
      }
      if (payload?.type === 'transport_map_tap') {
        onMapTap?.();
      }
      if (
        payload?.type === 'transport_map_viewport' &&
        typeof payload.latitude === 'number' &&
        typeof payload.longitude === 'number' &&
        typeof payload.zoom === 'number'
      ) {
        viewportRef.current = {
          center: {
            latitude: payload.latitude,
            longitude: payload.longitude,
          },
          zoom: payload.zoom,
        };
        pendingFocusSelectedCounterRef.current = null;
        pendingFocusDepartureCounterRef.current = null;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMapTap, onMoveToPosition, onPickDeparturePoint, onPressDeparturePoint, onSelectIndex]);

  return (
    <View style={[styles.wrap, !showHeader && styles.wrapFull]}>
      {showHeader ? (
        <View style={styles.header}>
          <Text variant="titleSmall" style={styles.title}>
            Карта маршрута
          </Text>
          <Text variant="bodySmall" style={styles.counter}>
            На карте: {mapPoints.length} из {totalCount} точек
          </Text>
        </View>
      ) : null}
      <View style={[styles.mapContainer, !framed && styles.mapContainerPlain, { height }]}>
        {mapPoints.length || departurePickMode ? (
          Platform.OS === 'web' ? (
            React.createElement('iframe', {
              ref: iframeRef,
              srcDoc: html,
              style: {
                border: 'none',
                width: '100%',
                height: '100%',
              },
              sandbox: 'allow-scripts allow-same-origin',
            })
          ) : (
            <WebView
              originWhitelist={['*']}
              style={StyleSheet.absoluteFill}
              source={{ html, baseUrl: LEAFLET_NATIVE_BASE_URL }}
              onMessage={(event) => {
                let payload: any = event.nativeEvent.data;
                try {
                  payload = JSON.parse(payload);
                } catch {
                  return;
                }
                if (payload?.type === 'transport_route_point_select' && Number.isInteger(payload.sourceIndex)) {
                  onSelectIndex?.(payload.sourceIndex);
                }
                if (
                  payload?.type === 'transport_route_point_move_to' &&
                  Number.isInteger(payload.sourceIndex) &&
                  Number.isInteger(payload.position)
                ) {
                  onMoveToPosition?.(payload.sourceIndex, payload.position);
                }
                if (
                  payload?.type === 'transport_departure_point_pick' &&
                  typeof payload.latitude === 'number' &&
                  typeof payload.longitude === 'number'
                ) {
                  onPickDeparturePoint?.({
                    latitude: payload.latitude,
                    longitude: payload.longitude,
                  });
                }
                if (payload?.type === 'transport_departure_point_press') {
                  onPressDeparturePoint?.();
                }
                if (payload?.type === 'transport_map_tap') {
                  onMapTap?.();
                }
                if (
                  payload?.type === 'transport_map_viewport' &&
                  typeof payload.latitude === 'number' &&
                  typeof payload.longitude === 'number' &&
                  typeof payload.zoom === 'number'
                ) {
                  viewportRef.current = {
                    center: {
                      latitude: payload.latitude,
                      longitude: payload.longitude,
                    },
                    zoom: payload.zoom,
                  };
                  pendingFocusSelectedCounterRef.current = null;
                  pendingFocusDepartureCounterRef.current = null;
                }
              }}
              userAgent={MAP_USER_AGENT}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              setSupportMultipleWindows={false}
            />
          )
        ) : (
          <View style={styles.empty}>
            <Text variant="titleSmall" style={styles.emptyTitle}>
              Нет координат для карты
            </Text>
            <Text variant="bodySmall" style={styles.counter}>
              Точки без координат остаются доступны в списке маршрута.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 8,
  },
  wrapFull: {
    gap: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: '#0F172A',
    fontWeight: '900',
  },
  counter: {
    color: '#64748B',
  },
  mapContainer: {
    flex: 1,
    width: '100%',
    minHeight: 220,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
  },
  mapContainerPlain: {
    minHeight: 0,
    borderWidth: 0,
    borderRadius: 0,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 16,
  },
  emptyTitle: {
    color: '#0F172A',
    fontWeight: '800',
    textAlign: 'center',
  },
});
