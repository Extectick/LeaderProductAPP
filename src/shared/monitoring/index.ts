import { logger } from '@/utils/logger';

type SentryModule = {
  init?: (options: Record<string, unknown>) => void;
  captureException?: (error: unknown, context?: Record<string, unknown>) => void;
  addBreadcrumb?: (breadcrumb: Record<string, unknown>) => void;
};

let sentry: SentryModule | null = null;
let initialized = false;
let globalHandlerInstalled = false;

function env(name: string) {
  return (process.env[name] || '').trim();
}

function sentryEnabled() {
  return env('EXPO_PUBLIC_SENTRY_ENABLED').toLowerCase() === 'true';
}

function sentryDsn() {
  return env('EXPO_PUBLIC_SENTRY_DSN');
}

function sentryEnvironment() {
  return env('EXPO_PUBLIC_SENTRY_ENVIRONMENT') || 'production';
}

function sentryRelease() {
  return env('EXPO_PUBLIC_SENTRY_RELEASE');
}

function loadSentryModule(): SentryModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@sentry/react-native') as SentryModule;
    return mod;
  } catch {
    return null;
  }
}

export function initMonitoring() {
  if (initialized) return;
  initialized = true;

  const enabled = sentryEnabled();
  const dsn = sentryDsn();
  const environment = sentryEnvironment();
  const release = sentryRelease();

  if (enabled && !dsn) {
    logger.warn('Sentry is enabled but DSN is missing. Falling back to local logger.', undefined, 'monitoring');
    return;
  }

  if (!enabled || !dsn) {
    logger.info('Monitoring initialized in local-only mode', { enabled, hasDsn: Boolean(dsn) }, 'monitoring');
    return;
  }

  const moduleRef = loadSentryModule();
  if (!moduleRef?.init) {
    logger.warn('Sentry package is not installed, fallback to local logger', undefined, 'monitoring');
    return;
  }

  try {
    moduleRef.init({
      dsn,
      enabled: true,
      environment,
      release: release || undefined,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.0,
    });
    sentry = moduleRef;
    logger.info('Sentry initialized', undefined, 'monitoring');
  } catch (error) {
    logger.captureException(error, { where: 'initMonitoring' }, 'monitoring');
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (sentry?.captureException) {
    try {
      sentry.captureException(error, context);
    } catch {
      // noop
    }
  }
  logger.captureException(error, context, 'monitoring');
}

export function addMonitoringBreadcrumb(message: string, data?: Record<string, unknown>) {
  if (sentry?.addBreadcrumb) {
    try {
      sentry.addBreadcrumb({
        category: 'app',
        message,
        data,
        timestamp: Date.now() / 1000,
      });
    } catch {
      // noop
    }
  }
  logger.debug(message, data, 'monitoring');
}

export function installGlobalJsErrorHandler() {
  if (globalHandlerInstalled) return;
  globalHandlerInstalled = true;

  try {
    // @ts-ignore
    const defaultHandler = global.ErrorUtils?.getGlobalHandler?.();
    // @ts-ignore
    global.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
      captureException(error, { isFatal: Boolean(isFatal), source: 'global_error_handler' });
      if (defaultHandler) {
        defaultHandler(error, isFatal);
      }
    });
  } catch (error) {
    logger.captureException(error, { where: 'installGlobalJsErrorHandler' }, 'monitoring');
  }
}
