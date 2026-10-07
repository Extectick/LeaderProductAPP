// Keep the native SDK lazy: web/unsupported APKs must not initialize it merely
// by importing a settings screen. The boundary is also mockable in unit tests.
export const loadTraccarSdk = () => import('react-native-traccar-client-sdk');
