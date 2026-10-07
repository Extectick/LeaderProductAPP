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

const channel = process.env.EXPO_PUBLIC_UPDATE_CHANNEL || 'prod';
const expectedEnvironment = channel === 'dev' ? 'development' : 'production';
const expectedHost = channel === 'dev' ? 'dev.leader-product.ru' : 'api.leader-product.ru';
let parsed;
try { parsed = new URL(dsn); } catch { throw new Error('Invalid diagnostic DSN'); }
if (parsed.protocol !== 'https:' || parsed.hostname !== expectedHost || !/^\/sentry\/\d+$/.test(parsed.pathname)
    || environment !== expectedEnvironment || !process.env.EXPO_PUBLIC_SENTRY_RELEASE) {
  throw new Error('Diagnostic channel, HTTPS ingestion host, release or environment mismatch');
}

console.log('Sentry config is valid for enabled mode');
