const enabled = String(process.env.EXPO_PUBLIC_SENTRY_ENABLED || '').trim().toLowerCase() === 'true';
const dsn = String(process.env.EXPO_PUBLIC_SENTRY_DSN || '').trim();
const environment = String(process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || '').trim();

if (!enabled) {
  console.log('Sentry check skipped: EXPO_PUBLIC_SENTRY_ENABLED is not true');
  process.exit(0);
}

if (!dsn) {
  console.error('Sentry config error: EXPO_PUBLIC_SENTRY_ENABLED=true but EXPO_PUBLIC_SENTRY_DSN is empty');
  process.exit(1);
}

if (!environment) {
  console.error('Sentry config error: EXPO_PUBLIC_SENTRY_ENVIRONMENT is empty while Sentry is enabled');
  process.exit(1);
}

if (process.env.EXPO_PUBLIC_UPDATE_CHANNEL !== 'dev' || environment !== 'development') {
  console.error('Sentry rollout is development-only');
  process.exit(1);
}
const parsedDsn = new URL(dsn);
if (parsedDsn.protocol !== 'https:' || parsedDsn.hostname !== 'dev.leader-product.ru' || !parsedDsn.pathname.startsWith('/sentry/')) {
  console.error('Sentry DSN must use the private dev ingestion endpoint');
  process.exit(1);
}
if (!process.env.SENTRY_URL || !process.env.SENTRY_ORG || !process.env.SENTRY_PROJECT || !process.env.SENTRY_AUTH_TOKEN) {
  console.error('Sentry-enabled releases require private symbol-upload configuration');
  process.exit(1);
}

console.log('Sentry config is valid for enabled mode');
