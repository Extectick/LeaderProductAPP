import { logger } from '@/utils/logger';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { scrubCrashEvent, scrubDiagnosticValue } from './privacy';
import { getNativeDiagnostics, invokeNativeDiagnostic } from './nativeDiagnostics';

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
  // Expo replaces only statically addressed public environment variables.
  return process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'true';
}

function sentryDsn() {
  return (process.env.EXPO_PUBLIC_SENTRY_DSN || '').trim();
}

function sentryEnvironment() {
  return process.env.EXPO_PUBLIC_UPDATE_CHANNEL === 'dev' ? 'development' : 'production';
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
    const native = getNativeDiagnostics();
    moduleRef.init({
      dsn,
      enabled: true,
      environment,
      release: release || undefined,
      dist: Application.nativeBuildVersion || undefined,
      tracesSampleRate: 0,
      profilesSampleRate: 0.0,
      sendDefaultPii: false,
      enableLogs: false,
      enableAutoSessionTracking: false,
      enableAutoPerformanceTracing: false,
      enableNativeFramesTracking: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      attachThreads: false,
      maxBreadcrumbs: 30,
      maxQueueSize: 100,
      // OTA on runtime 0.1.26 has no early native privacy hook. Keep the
      // native offline transport, but capture only sanitized JS exceptions.
      // The new dev APK owns native initialization/privacy before React starts.
      // Do not let RN reinitialize it and replace the native beforeSend hook.
      autoInitializeNativeSdk: !native,
      enableNativeCrashHandling: Boolean(native),
      enableNdk: Boolean(native),
      enableWatchdogTerminationTracking: false,
      beforeSend: (event: any) => scrubCrashEvent({ ...event,
        tags: { ...event.tags, capture_mode: 'javascript' } }),
      beforeBreadcrumb: (breadcrumb: any) => breadcrumb.category === 'app'
        ? { ...breadcrumb, data: scrubDiagnosticValue(breadcrumb.data) } : null,
    });
    sentry = moduleRef;
    sentry.setTag?.('app_version', Application.nativeApplicationVersion || 'web');
    sentry.setTag?.('build_number', Application.nativeBuildVersion || 'web');
    sentry.setTag?.('runtime_version', String(Updates.runtimeVersion || 'unknown'));
    sentry.setTag?.('ota_update_id', Updates.updateId || 'embedded');
    if (native) {
      sentry.setTag?.('installation_id', native.installationId);
      sentry.setTag?.('app_session_id', native.sessionId);
      if (/^\d{1,20}$/.test(native.userId)) sentry.setUser?.({ id: native.userId });
      invokeNativeDiagnostic(n => n.setRuntime(String(Updates.runtimeVersion || 'unknown'), Updates.updateId || 'embedded'));
    } else {
      sentry.setTag?.('capture_mode', 'javascript');
    }
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
  if (/^[a-z_.:/-]{1,80}$/i.test(message)) invokeNativeDiagnostic(n => n.recordAction(message));
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
  // The SDK owns fatal-JS handling; wrapping it would report twice.
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

export async function setMonitoringUser(id: number | string | null | undefined) {
  const value = id == null ? '' : String(id);
  const safeId = /^\d{1,20}$/.test(value) ? value : null;
  try { sentry?.setUser?.(safeId ? { id: safeId } : null); } catch { /* Diagnostics must not break authentication. */ }
  try { await getNativeDiagnostics()?.setUser(safeId); } catch { /* Diagnostics must not break login/logout. */ }
}

export function setMonitoringScreen(route: string) {
  // useSegments supplies route templates, not actual document/customer IDs.
  sentry?.setTag?.('screen', route.split('?')[0].slice(0, 160));
  invokeNativeDiagnostic(n => n.setScreen(route.split('?')[0].slice(0, 160)));
}
