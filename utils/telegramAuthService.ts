import type {
  AuthLoginResponseData,
  TelegramContactResponseData,
  TelegramInitResponseData,
} from '@/types/apiTypes';
import {
  init as initTmaSdk,
  isTMA,
  requestContact as sdkRequestContact,
  retrieveLaunchParams,
  retrieveRawInitData,
  retrieveRawLaunchParams,
} from '@tma.js/sdk';
import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';

type TgWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  requestContact?: (cb?: (status: any) => void) => void;
};

const TG_WEBAPP_SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js';
let sdkInitialized = false;

type TgInitialLaunch = {
  href?: string;
  search?: string;
  hash?: string;
};

function getTgWebApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  const tg = (window as any)?.Telegram?.WebApp as TgWebApp | undefined;
  return tg || null;
}

function getInitialLaunch(): TgInitialLaunch | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).__tgInitialLaunch as TgInitialLaunch | undefined) || null;
}

function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function ensureSdkInit() {
  if (typeof window === 'undefined' || sdkInitialized) return;
  try {
    initTmaSdk();
    sdkInitialized = true;
  } catch {
    // SDK can throw outside Telegram environment.
  }
}

function getSearchParam(name: string, source?: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const search = typeof source === 'string' ? source : String(window.location.search || '');
    return String(new URLSearchParams(search).get(name) || '').trim();
  } catch {
    return '';
  }
}

function getHashParam(name: string, source?: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const hashRaw = typeof source === 'string' ? source : String(window.location.hash || '');
    const hash = hashRaw.replace(/^#/, '');
    return String(new URLSearchParams(hash).get(name) || '').trim();
  } catch {
    return '';
  }
}

function hasTelegramLaunchHints() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    return (
      params.has('tgWebAppData') ||
      params.has('tgWebAppVersion') ||
      params.has('tgWebAppPlatform') ||
      params.has('tgWebAppStartParam') ||
      params.has('startapp') ||
      hashParams.has('tgWebAppData') ||
      hashParams.has('tgWebAppVersion') ||
      hashParams.has('tgWebAppPlatform') ||
      hashParams.has('tgWebAppStartParam') ||
      hashParams.has('startapp')
    );
  } catch {
    return false;
  }
}

function isTelegramUserAgentHint() {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  return /Telegram/i.test(ua);
}

function ensureTelegramWebAppScript() {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector(`script[src="${TG_WEBAPP_SCRIPT_SRC}"]`);
  if (existing) return;
  const script = document.createElement('script');
  script.src = TG_WEBAPP_SCRIPT_SRC;
  script.async = true;
  document.head.appendChild(script);
}

export function getTelegramInitDataRaw() {
  ensureSdkInit();

  const rawSdk = safeCall(() => String(retrieveRawInitData() || '').trim(), '');
  if (rawSdk) return rawSdk;

  const tg = getTgWebApp();
  const fromWebApp = String(tg?.initData || '').trim();
  if (fromWebApp) return fromWebApp;
  const initialLaunch = getInitialLaunch();
  const fromCurrent =
    getSearchParam('tgWebAppData') ||
    getHashParam('tgWebAppData');
  if (fromCurrent) return fromCurrent;
  return (
    getSearchParam('tgWebAppData', initialLaunch?.search) ||
    getHashParam('tgWebAppData', initialLaunch?.hash)
  );
}

export function isTelegramMiniApp() {
  if (getTelegramInitDataRaw()) return true;
  ensureSdkInit();
  return safeCall(() => isTMA(), false);
}

export function isTelegramMiniAppLaunch() {
  if (isTelegramMiniApp() || hasTelegramLaunchHints() || isTelegramUserAgentHint()) return true;
  ensureSdkInit();
  const launchParams = safeCall(() => retrieveLaunchParams() as any, null as any);
  return Boolean(
    launchParams &&
      (launchParams.tgWebAppVersion ||
        launchParams.tgWebAppPlatform ||
        launchParams.tgWebAppData ||
        launchParams.tgWebAppStartParam)
  );
}

export function prepareTelegramWebApp() {
  ensureTelegramWebAppScript();
  ensureSdkInit();
  const tg = getTgWebApp();
  try {
    tg?.ready?.();
    tg?.expand?.();
  } catch {
    // noop
  }
}

function normalizePhoneForApi(phoneRaw: string): string | null {
  const digits = String(phoneRaw || '').replace(/\D/g, '');
  if (!digits) return null;
  let normalized = digits;
  if (normalized.length === 10) normalized = `7${normalized}`;
  if (normalized.length === 11 && normalized.startsWith('8')) {
    normalized = `7${normalized.slice(1)}`;
  }
  if (normalized.length !== 11 || !normalized.startsWith('7')) return null;
  return `+${normalized}`;
}

export type TelegramContactRequestResult = {
  ok: boolean;
  phoneE164: string | null;
  source: 'sdk' | 'legacy' | 'none';
};

export async function requestTelegramContact(): Promise<TelegramContactRequestResult> {
  ensureSdkInit();
  try {
    const requested = await sdkRequestContact({ timeout: 10000 });
    const phoneRaw = String(requested?.contact?.phone_number || '').trim();
    const phoneE164 = normalizePhoneForApi(phoneRaw) || null;
    return { ok: true, phoneE164, source: 'sdk' };
  } catch {
    // Continue to legacy fallback.
  }

  const tg = getTgWebApp();
  const requestContactFn = tg?.requestContact;
  if (!requestContactFn) return { ok: false, phoneE164: null, source: 'none' };
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve({ ok, phoneE164: null, source: 'legacy' });
    };
    const timeout = setTimeout(() => finish(false), 10000);
    try {
      requestContactFn((status: any) => {
        clearTimeout(timeout);
        if (typeof status === 'string') {
          const lowered = status.toLowerCase();
          return finish(lowered.includes('sent') || lowered.includes('ok') || lowered.includes('success'));
        }
        return finish(Boolean(status));
      });
    } catch {
      clearTimeout(timeout);
      finish(false);
    }
  });
}

export function getTelegramSdkDiagnostics() {
  ensureSdkInit();
  const rawInitData = safeCall(() => String(retrieveRawInitData() || ''), '');
  const rawLaunchParams = safeCall(() => String(retrieveRawLaunchParams() || ''), '');
  const launchParams = safeCall(() => retrieveLaunchParams() as any, null as any);
  return {
    sdk: {
      sdkInitialized,
      isTma: safeCall(() => isTMA(), false),
      rawInitDataLength: rawInitData.length,
      rawInitData,
      rawLaunchParamsLength: rawLaunchParams.length,
      rawLaunchParams,
      launchParams,
    },
  };
}

export async function telegramInit(initDataRaw: string) {
  const res = await apiClient<{ initDataRaw: string }, TelegramInitResponseData>(
    API_ENDPOINTS.AUTH.TELEGRAM_INIT,
    {
      method: 'POST',
      body: { initDataRaw },
      skipAuth: true,
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось инициализировать Telegram');
  return res.data;
}

export async function telegramContact(tgSessionToken: string, phoneE164: string) {
  const res = await apiClient<{ tgSessionToken: string; phoneE164: string }, TelegramContactResponseData>(
    API_ENDPOINTS.AUTH.TELEGRAM_CONTACT,
    {
      method: 'POST',
      body: { tgSessionToken, phoneE164 },
      skipAuth: true,
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось отправить контакт');
  return res.data;
}

export async function telegramContactStatus(tgSessionToken: string) {
  const res = await apiClient<void, TelegramContactResponseData>(
    `${API_ENDPOINTS.AUTH.TELEGRAM_CONTACT_STATUS}?tgSessionToken=${encodeURIComponent(tgSessionToken)}`,
    {
      method: 'GET',
      skipAuth: true,
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось проверить контакт');
  return res.data;
}

export async function telegramSignIn(tgSessionToken: string) {
  const res = await apiClient<{ tgSessionToken: string }, AuthLoginResponseData>(
    API_ENDPOINTS.AUTH.TELEGRAM_SIGN_IN,
    {
      method: 'POST',
      body: { tgSessionToken },
      skipAuth: true,
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось войти через Telegram');
  return res.data;
}

export async function telegramLink(tgSessionToken: string) {
  const res = await apiClient<{ tgSessionToken: string }, { profile: any }>(
    API_ENDPOINTS.AUTH.TELEGRAM_LINK,
    {
      method: 'POST',
      body: { tgSessionToken },
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось привязать Telegram');
  return res.data;
}
