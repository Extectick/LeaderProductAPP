import { logger } from '@/utils/logger';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { scrubCrashEvent, scrubDiagnosticValue } from './privacy';

type SentryModule = {
  init?: (options: Record<string, unknown>) => void;
  captureException?: (error: unknown, context?: Record<string, unknown>) => void;
  addBreadcrumb?: (breadcrumb: Record<string, unknown>) => void;
  setUser?: (user: { id: string } | null) => void;
  setTag?: (name: string, value: string) => void;
};

let sentry: SentryModule | null = null;
let initialized = false;
let globalHandlerInstalled = false;

function sentryEnabled() {
  // Expo only inlines statically addressed EXPO_PUBLIC_* variables.
  return process.env.EXPO_PUBLIC_UPDATE_CHANNEL === 'dev'
    && process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'true';
}

function sentryDsn() {
  return (process.env.EXPO_PUBLIC_SENTRY_DSN || '').trim();
}

function sentryEnvironment() {
  return 'development';
}

function sentryRelease() {
  return (process.env.EXPO_PUBLIC_SENTRY_RELEASE || '').trim();
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
      tracesSampleRate: 0,
      profilesSampleRate: 0.0,
      sendDefaultPii: false,
      maxBreadcrumbs: 40,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableLogs: false,
      enableAutoSessionTracking: false,
      autoInitializeNativeSdk: Platform.OS !== 'android' || Number(Application.nativeBuildVersion || 0) < 31,
      beforeSend: scrubCrashEvent,
      beforeBreadcrumb: (breadcrumb: any) => breadcrumb.category === 'app'
        ? { ...breadcrumb, data: scrubDiagnosticValue(breadcrumb.data) } : null,
    });
    sentry = moduleRef;
    sentry.setTag?.('js_monitoring_ready', 'true');
    sentry.setTag?.('app_version', Application.nativeApplicationVersion || 'web');
    sentry.setTag?.('build_number', Application.nativeBuildVersion || 'web');
    sentry.setTag?.('runtime_version', String(Updates.runtimeVersion || 'unknown'));
    sentry.setTag?.('ota_update_id', Updates.updateId || 'embedded');
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
}

export function installGlobalJsErrorHandler() {
  // Sentry installs its own fatal handler. Wrapping it would capture twice.
  if (sentry) return;
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

export function setMonitoringUser(id: number | string | null | undefined) {
  sentry?.setUser?.(id == null ? null : { id: String(id) });
}

export function setMonitoringScreen(route: string) {
  // Caller passes a route template, never a URL with query / client details.
  sentry?.setTag?.('screen', route.slice(0, 160));
}
