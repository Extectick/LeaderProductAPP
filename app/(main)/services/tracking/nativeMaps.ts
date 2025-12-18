// Fallback stub so Expo Router has a non-platform-specific sibling.
// We don't render native maps on web/native in this route; components import their own map impls.
export const MapView = null;
export const Marker = null;
export const Polyline = null;

export default function NativeMapsFallback() {
  return null;
}
