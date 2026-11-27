import { setPickerActionOwner } from './pickerActions';
import type { AppErrorScreen } from './appErrorPayload';
import type { OrderLoopStage } from '../../features/clientOrders/screen/orderLoopStage';
import { updateNativeAppErrorIdentity, updateNativeAppErrorScreen, updateNativeAppErrorRuntime } from './nativeAppErrors';
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

let reportOwner: number | null = null;
let reportScreen: AppErrorScreen = 'unknown';
const reported = new WeakSet<object>();
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
  updateNativeAppErrorRuntime(String(Updates.runtimeVersion || 'unknown'), Updates.updateId || 'embedded');

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
      // New APKs own native initialization/privacy before React starts.
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

type CaptureDetails = { screen?: AppErrorScreen; stage?: OrderLoopStage; componentStack?: string | null };

export function captureException(error: unknown, context?: Record<string, unknown>, details?: CaptureDetails) {
  try {
    if (reportOwner && (typeof error !== 'object' || !error || !reported.has(error))) {
      if (error && typeof error === 'object') reported.add(error);
      // Keep transport out of bootstrap and never send arbitrary caller context.
      const { queueAppErrorReport } = require('./appErrorDelivery') as typeof import('./appErrorDelivery');
      const source = context?.source === 'router_error_boundary' ? 'react_boundary' :
        context?.source === 'global_error_handler' ? 'global_js' : 'captured';
      void queueAppErrorReport({ ownerId: reportOwner, error, source, screen: details?.screen || reportScreen,
        stage: details?.stage, componentStack: details?.componentStack }).catch(() => {});
    }
  } catch { /* Retain the local logger and the platform fallback. */ }
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
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('error', event => {
        if (event.error) captureException(event.error, { source: 'global_error_handler' });
      });
      window.addEventListener('unhandledrejection', event => {
        captureException(event.reason, { source: 'global_error_handler' });
      });
    }
    // React Native installs its own Hermes rejection tracker in development only.
    if (typeof __DEV__ !== 'undefined' && !__DEV__) {
      const hermes = (globalThis as typeof globalThis & { HermesInternal?: {
        hasPromise?: () => boolean;
        enablePromiseRejectionTracker?: (options: { allRejections: boolean; onUnhandled(id: number, reason: unknown): void }) => void;
      } }).HermesInternal;
      try {
        if (hermes?.hasPromise?.()) hermes.enablePromiseRejectionTracker?.({
          allRejections: true,
          onUnhandled: (_id, reason) => { captureException(reason, { source: 'global_error_handler' }); },
        });
      } catch { /* The global exception handler below also works without Hermes. */ }
    }
    // @ts-ignore
    const defaultHandler = global.ErrorUtils?.getGlobalHandler?.();
    // @ts-ignore
    global.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
      try { captureException(error, { isFatal: Boolean(isFatal), source: 'global_error_handler' }); }
      finally { defaultHandler?.(error, isFatal); }
    });
  } catch (error) {
    logger.captureException(error, { where: 'installGlobalJsErrorHandler' }, 'monitoring');
  }
}

export async function setMonitoringUser(id: number | string | null | undefined) {
  const value = id == null ? '' : String(id);
  const safeId = /^\d{1,20}$/.test(value) ? value : null;
  reportOwner = safeId && Number.isSafeInteger(Number(safeId)) ? Number(safeId) : null;
  setPickerActionOwner(reportScreen === 'orders' ? reportOwner : null);
  updateNativeAppErrorIdentity(reportOwner);
  try { sentry?.setUser?.(safeId ? { id: safeId } : null); } catch { /* Diagnostics must not break authentication. */ }
  try { await getNativeDiagnostics()?.setUser(safeId); } catch { /* Diagnostics must not break login/logout. */ }
}

export function setMonitoringScreen(route: string) {
  try {
    const { appErrorScreenFromPath } = require('./appErrorPayload') as typeof import('./appErrorPayload');
    reportScreen = appErrorScreenFromPath(route);
    updateNativeAppErrorScreen(reportScreen);
  } catch { reportScreen = 'unknown'; }
  setPickerActionOwner(reportScreen === 'orders' ? reportOwner : null);
  // useSegments supplies route templates, not actual document/customer IDs.
  sentry?.setTag?.('screen', route.split('?')[0].slice(0, 160));
  invokeNativeDiagnostic(n => n.setScreen(route.split('?')[0].slice(0, 160)));
}
