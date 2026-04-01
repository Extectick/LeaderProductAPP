import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export type LeafletPoint = { latitude: number; longitude: number; label?: string };
const OSM_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const OSM_TILE_SUBDOMAINS = 'abcd';
const OSM_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const LEAFLET_NATIVE_BASE_URL = 'https://carto.com/';

type Props = {
  points: LeafletPoint[];
  height?: number;
  selectedIndex?: number | null;
  selectedVerticalOffsetPx?: number;
  onMapTap?: () => void;
};

// HTML-шаблон с Leaflet: поднимаем карту, рисуем polyline и маркеры старта/финиша
const buildHtml = (
  points: LeafletPoint[],
  selectedIndex?: number | null,
  selectedVerticalOffsetPx = 0
) => {
  const coords = points.map((p) => [p.latitude, p.longitude, p.label]);
  const encoded = JSON.stringify(coords);
  const selected = selectedIndex ?? -1;
  const offset = Math.max(0, Math.floor(selectedVerticalOffsetPx));

  return `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
      .leaflet-control-container .leaflet-bottom.leaflet-right { margin-bottom: 18px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const coords = ${encoded};
      const map = L.map('map', { zoomControl: true });
      const tileUrl = '${OSM_TILE_URL}';
      const attribution = '${OSM_TILE_ATTRIBUTION}';
      L.tileLayer(tileUrl, {
        attribution,
        maxZoom: 20,
        subdomains: '${OSM_TILE_SUBDOMAINS}',
      }).addTo(map);

      const emitMapTap = () => {
        const payload = JSON.stringify({ type: 'leaflet_map_tap' });
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(payload);
          }
        } catch (e) {}
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(payload, '*');
          }
        } catch (e) {}
      };

      map.on('click', () => emitMapTap());

      if (coords.length > 0) {
        const latlngs = coords.map(([lat, lng]) => L.latLng(lat, lng));
        const line = L.polyline(latlngs, { color: '#2563eb', weight: 4 }).addTo(map);
        if (${selected} >= 0 && latlngs[${selected}] ) {
          map.setView(latlngs[${selected}], 15);
          if (${offset} > 0) {
            map.panBy([0, ${offset}], { animate: false });
          }
        } else if (latlngs.length > 1) {
          map.fitBounds(line.getBounds(), { padding: [24, 24] });
        } else {
          map.setView(latlngs[0], 15);
        }

        coords.forEach(([lat, lng, label], idx) => {
          const isSelected = idx === ${selected};
          const m = L.circleMarker([lat, lng], { radius: isSelected ? 6 : 4, color: isSelected ? '#ef4444' : '#2563eb', weight: 2 });
          if (label) m.bindTooltip(label, { direction: 'top', offset: [0, -4], opacity: 0.8 });
          m.addTo(map);
        });

        L.marker(latlngs[0], { title: 'Старт' }).addTo(map);
        if (latlngs.length > 1) L.marker(latlngs[latlngs.length - 1], { title: 'Финиш' }).addTo(map);
      } else {
        map.setView([0, 0], 1);
      }
    </script>
  </body>
</html>
`;
};

export default function LeafletMap({
  points,
  height = 240,
  selectedIndex,
  selectedVerticalOffsetPx = 0,
  onMapTap,
}: Props) {
  const iframeRef = useRef<any>(null);
  const html = useMemo(
    () => buildHtml(points, selectedIndex, selectedVerticalOffsetPx),
    [points, selectedIndex, selectedVerticalOffsetPx]
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || !onMapTap) return;
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const raw = event.data;
      let payload: any = raw;
      if (typeof raw === 'string') {
        try {
          payload = JSON.parse(raw);
        } catch {
          return;
        }
      }
      if (payload?.type === 'leaflet_map_tap') {
        onMapTap();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMapTap]);

  if (Platform.OS === 'web') {
    // Web: WebView недоступен, используем iframe напрямую
    return (
      <View style={[styles.container, { height }]}>
        {React.createElement('iframe', {
          ref: iframeRef,
          srcDoc: html,
          style: {
            border: 'none',
            width: '100%',
            height: '100%',
          },
          // sandbox с разрешением скриптов, но без лишних прав
          sandbox: 'allow-scripts allow-same-origin',
        })}
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        originWhitelist={['*']}
        style={StyleSheet.absoluteFill}
        source={{ html, baseUrl: LEAFLET_NATIVE_BASE_URL }}
        onMessage={(event) => {
          if (!onMapTap) return;
          let payload: any = event.nativeEvent.data;
          try {
            payload = JSON.parse(payload);
          } catch {
            return;
          }
          if (payload?.type === 'leaflet_map_tap') {
            onMapTap();
          }
        }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
});
