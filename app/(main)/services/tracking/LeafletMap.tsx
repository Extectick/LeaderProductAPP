import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export type LeafletPoint = { latitude: number; longitude: number; label?: string };

type Props = {
  points: LeafletPoint[];
  height?: number;
  selectedIndex?: number | null;
};

// HTML-шаблон с Leaflet: поднимаем карту, рисуем polyline и маркеры старта/финиша
const buildHtml = (points: LeafletPoint[], selectedIndex?: number | null) => {
  const coords = points.map((p) => [p.latitude, p.longitude, p.label]);
  const encoded = JSON.stringify(coords);
  const selected = selectedIndex ?? -1;

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
      const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
      L.tileLayer(tileUrl, { attribution, maxZoom: 19 }).addTo(map);

      if (coords.length > 0) {
        const latlngs = coords.map(([lat, lng]) => L.latLng(lat, lng));
        const line = L.polyline(latlngs, { color: '#2563eb', weight: 4 }).addTo(map);
        if (${selected} >= 0 && latlngs[${selected}] ) {
          map.setView(latlngs[${selected}], 15);
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

export default function LeafletMap({ points, height = 240, selectedIndex }: Props) {
  const html = useMemo(() => buildHtml(points, selectedIndex), [points, selectedIndex]);

  if (Platform.OS === 'web') {
    // Web: WebView недоступен, используем iframe напрямую
    return (
      <View style={[styles.container, { height }]}>
        {React.createElement('iframe', {
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
        source={{ html }}
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
