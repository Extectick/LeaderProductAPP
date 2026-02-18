import type {
  AuthLoginResponseData,
  MaxContactResponseData,
  MaxInitResponseData,
} from '@/src/shared/types/api';
import { normalizePhoneInputToDigits11 } from './phone';
import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';

type MaxWebApp = {
  initData?: string;
  InitData?: string;
  ready?: () => void;
  expand?: () => void;
  requestContact?: (...args: any[]) => Promise<any> | any;
};

const MAX_WEBAPP_SCRIPT_SRC = 'https://st.max.ru/js/max-web-app.js';
const MAX_WEBAPP_LOAD_TIMEOUT_MS = 5000;
let maxWebAppScriptPromise: Promise<void> | null = null;

function ensureMaxWebAppScript() {
  if (typeof document === 'undefined') return;
  if (getMaxWebApp()) return;
  if (maxWebAppScriptPromise) return;

  maxWebAppScriptPromise = new Promise<void>((resolve, reject) => {
    const finishResolve = () => resolve();
    const finishReject = (reason: string) => reject(new Error(reason));
    const existing = document.querySelector(`script[src="${MAX_WEBAPP_SCRIPT_SRC}"]`) as HTMLScriptElement | null;

    if (existing) {
      const loaded = existing.getAttribute('data-max-loaded') === '1';
      if (loaded || getMaxWebApp()) {
        finishResolve();
        return;
      }
      existing.addEventListener('load', () => {
        existing.setAttribute('data-max-loaded', '1');
        finishResolve();
      }, { once: true });
      existing.addEventListener('error', () => {
        finishReject('MAX bridge script load failed');
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = MAX_WEBAPP_SCRIPT_SRC;
    script.async = true;
    script.addEventListener('load', () => {
      script.setAttribute('data-max-loaded', '1');
      finishResolve();
    }, { once: true });
    script.addEventListener('error', () => {
      finishReject('MAX bridge script load failed');
    }, { once: true });
    document.head.appendChild(script);
  });
}

async function waitForMaxWebApp(timeoutMs = MAX_WEBAPP_LOAD_TIMEOUT_MS): Promise<MaxWebApp | null> {
  ensureMaxWebAppScript();
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const webApp = getMaxWebApp();
    if (webApp) return webApp;
    if (maxWebAppScriptPromise) {
      try {
        await Promise.race([
          maxWebAppScriptPromise,
          new Promise((resolve) => setTimeout(resolve, 120)),
        ]);
      } catch {
        // ignore: we'll still try direct globals.
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  return getMaxWebApp();
}

function getMaxWebApp(): MaxWebApp | null {
  if (typeof window === 'undefined') return null;
  const root = window as any;
  return (
    (root?.WebApp as MaxWebApp | undefined) ||
    (root?.MAX?.WebApp as MaxWebApp | undefined) ||
    (root?.Max?.WebApp as MaxWebApp | undefined) ||
    null
  );
}

function getSearchParam(name: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return String(new URLSearchParams(window.location.search).get(name) || '').trim();
  } catch {
    return '';
  }
}

function getHashParam(name: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const hash = String(window.location.hash || '').replace(/^#/, '');
    return String(new URLSearchParams(hash).get(name) || '').trim();
  } catch {
    return '';
  }
}

function normalizeStartParamValue(raw: string): string {
  let value = String(raw || '').trim();
  if (!value) return '';
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep as-is
  }
  value = value.trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
  return value;
}

function parseParamsFromRaw(raw: string): URLSearchParams | null {
  const base = String(raw || '').trim();
  if (!base) return null;
  const candidates = [base];
  try {
    candidates.push(decodeURIComponent(base));
  } catch {
    // ignore
  }
  for (const candidate of candidates) {
    const parsed = new URLSearchParams(candidate.replace(/^\?/, ''));
    if (Array.from(parsed.keys()).length > 0) return parsed;
  }
  return null;
}

function normalizePhoneForApi(phoneRaw: string): string | null {
  return normalizePhoneInputToDigits11(phoneRaw);
}

function extractPhoneFromContactResult(payload: any): string | null {
  const candidate =
    payload?.contact?.phone_number ??
    payload?.contact?.phone ??
    payload?.phone_number ??
    payload?.phone ??
    payload?.data?.phone_number ??
    payload?.data?.phone;
  const raw = String(candidate || '').trim();
  return raw ? raw : null;
}

function hasMaxLaunchHints() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    const keys = [
      'WebAppData',
      'WebAppVersion',
      'WebAppPlatform',
      'WebAppStartParam',
      'webAppData',
      'webAppVersion',
      'webAppPlatform',
      'webAppStartParam',
      'maxWebAppData',
      'maxWebAppVersion',
      'maxWebAppPlatform',
      'maxWebAppStartParam',
      'startapp',
      'start_param',
    ];
    return (
      keys.some((key) => params.has(key)) ||
      keys.some((key) => hashParams.has(key))
    );
  } catch {
    return false;
  }
}

export function getMaxInitDataRaw() {
  ensureMaxWebAppScript();
  const webApp = getMaxWebApp();
  const fromBridge = String(webApp?.initData || webApp?.InitData || '').trim();
  if (fromBridge) return fromBridge;

  const params = [
    'WebAppData',
    'webAppData',
    'maxWebAppData',
    'initData',
  ];
  for (const name of params) {
    const value = getSearchParam(name) || getHashParam(name);
    if (value) return value;
  }
  return '';
}

export function isMaxMiniApp() {
  ensureMaxWebAppScript();
  return Boolean(getMaxInitDataRaw());
}

export function isMaxMiniAppLaunch() {
  ensureMaxWebAppScript();
  if (isMaxMiniApp()) return true;
  return hasMaxLaunchHints();
}

export function getMaxStartParam(): string {
  const names = [
    'startapp',
    'WebAppStartParam',
    'webAppStartParam',
    'maxWebAppStartParam',
    'start_param',
  ];
  for (const name of names) {
    const value = normalizeStartParamValue(getSearchParam(name) || getHashParam(name));
    if (value) return value;
  }

  const initDataRaw = getMaxInitDataRaw();
  if (initDataRaw) {
    const parsed = parseParamsFromRaw(initDataRaw);
    if (parsed) {
      for (const name of names) {
        const value = normalizeStartParamValue(String(parsed.get(name) || ''));
        if (value) return value;
      }
    }
  }
  return '';
}

export function getMaxStartAppealId(): number | null {
  const raw = getMaxStartParam();
  const match = raw.match(/^appeal_(\d+)$/i);
  if (!match) return null;
  const appealId = Number(match[1]);
  if (!Number.isFinite(appealId) || appealId <= 0) return null;
  return appealId;
}

export function prepareMaxWebApp() {
  ensureMaxWebAppScript();
  const webApp = getMaxWebApp();
  try {
    webApp?.ready?.();
    webApp?.expand?.();
  } catch {
    // noop
  }
}

export type MaxContactRequestResult = {
  ok: boolean;
  phoneE164: string | null;
  source: 'bridge' | 'none';
  reason?: string;
};

export async function requestMaxContact(): Promise<MaxContactRequestResult> {
  const webApp = await waitForMaxWebApp();
  const requestContactFn = webApp?.requestContact;
  if (!requestContactFn) {
    return { ok: false, phoneE164: null, source: 'none', reason: 'MAX_BRIDGE_UNAVAILABLE' };
  }

  const bridgeOutcome = await new Promise<{ ok: boolean; payload?: any; error?: any; timedOut?: boolean }>((resolve) => {
    let resolved = false;
    const done = (value: { ok: boolean; payload?: any; error?: any; timedOut?: boolean }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(value);
    };

    const timeout = setTimeout(() => {
      done({ ok: false, timedOut: true });
    }, 15000);

    const onDone = (payload: any) => done({ ok: true, payload });

    try {
      const maybePromise =
        requestContactFn.length > 0
          ? requestContactFn.call(webApp, onDone)
          : requestContactFn.call(webApp);
      if (maybePromise && typeof (maybePromise as Promise<any>).then === 'function') {
        void (maybePromise as Promise<any>)
          .then((payload) => done({ ok: true, payload }))
          .catch((error) => done({ ok: false, error }));
      } else if (maybePromise !== undefined && requestContactFn.length === 0) {
        done({ ok: true, payload: maybePromise });
      }
    } catch (error) {
      done({ ok: false, error });
    }
  });

  if (!bridgeOutcome.ok) {
    if (bridgeOutcome.timedOut) {
      return { ok: false, phoneE164: null, source: 'bridge', reason: 'CONTACT_REQUEST_TIMEOUT' };
    }
    const code =
      String(
        bridgeOutcome.error?.error?.code ||
          bridgeOutcome.error?.code ||
          bridgeOutcome.error?.message ||
          ''
      ).trim() || 'CONTACT_REQUEST_FAILED';
    return { ok: false, phoneE164: null, source: 'bridge', reason: code };
  }

  const payload = bridgeOutcome.payload;
  const bridgeError =
    String(payload?.error?.code || payload?.code || '').trim();
  if (bridgeError) {
    return { ok: false, phoneE164: null, source: 'bridge', reason: bridgeError };
  }

  const phoneRaw = extractPhoneFromContactResult(payload);
  if (phoneRaw) {
    const phoneE164 = normalizePhoneForApi(phoneRaw);
    if (!phoneE164) {
      return { ok: false, phoneE164: null, source: 'bridge', reason: 'PHONE_FORMAT_UNSUPPORTED' };
    }
    return { ok: true, phoneE164, source: 'bridge' };
  }

  if (payload === true || payload === 'ok' || payload === 'success') {
    return { ok: true, phoneE164: null, source: 'bridge' };
  }

  return { ok: false, phoneE164: null, source: 'bridge', reason: 'PHONE_NOT_PROVIDED' };
}

export async function maxInit(initDataRaw: string) {
  const res = await apiClient<{ initDataRaw: string }, MaxInitResponseData>(
    API_ENDPOINTS.AUTH.MAX_INIT,
    {
      method: 'POST',
      body: { initDataRaw },
      skipAuth: true,
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось инициализировать MAX');
  return res.data;
}

export async function maxContact(maxSessionToken: string, phoneE164: string) {
  const res = await apiClient<{ maxSessionToken: string; phoneE164: string }, MaxContactResponseData>(
    API_ENDPOINTS.AUTH.MAX_CONTACT,
    {
      method: 'POST',
      body: { maxSessionToken, phoneE164 },
      skipAuth: true,
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось отправить контакт');
  return res.data;
}

export async function maxContactStatus(maxSessionToken: string) {
  const res = await apiClient<void, MaxContactResponseData>(
    `${API_ENDPOINTS.AUTH.MAX_CONTACT_STATUS}?maxSessionToken=${encodeURIComponent(maxSessionToken)}`,
    {
      method: 'GET',
      skipAuth: true,
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось проверить контакт');
  return res.data;
}

export async function maxSignIn(maxSessionToken: string) {
  const res = await apiClient<{ maxSessionToken: string }, AuthLoginResponseData>(
    API_ENDPOINTS.AUTH.MAX_SIGN_IN,
    {
      method: 'POST',
      body: { maxSessionToken },
      skipAuth: true,
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось войти через MAX');
  return res.data;
}

export async function maxLink(maxSessionToken: string) {
  const res = await apiClient<{ maxSessionToken: string }, { profile: any }>(
    API_ENDPOINTS.AUTH.MAX_LINK,
    {
      method: 'POST',
      body: { maxSessionToken },
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось привязать MAX');
  return res.data;
}

