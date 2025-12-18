// Web stub to avoid bundling native-only react-native-maps
export const MapView = null;
export const Marker = null;
export const Polyline = null;

// Expo Router требует default export для файлов внутри app/,
// поэтому отдаем пустой компонент, чтобы роут не падал.
export default function NativeMapsStub() {
  return null;
}
