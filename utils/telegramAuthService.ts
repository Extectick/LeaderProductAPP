import type {
  AuthLoginResponseData,
  TelegramContactResponseData,
  TelegramInitResponseData,
} from '@/types/apiTypes';
import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';

type TgWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  requestContact?: (cb?: (status: any) => void) => void;
};

const TG_WEBAPP_SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js';

function getTgWebApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  const tg = (window as any)?.Telegram?.WebApp as TgWebApp | undefined;
  return tg || null;
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
  const tg = getTgWebApp();
  const fromWebApp = String(tg?.initData || '').trim();
  if (fromWebApp) return fromWebApp;
  return getSearchParam('tgWebAppData') || getHashParam('tgWebAppData');
}

export function isTelegramMiniApp() {
  return Boolean(getTelegramInitDataRaw());
}

export function isTelegramMiniAppLaunch() {
  return isTelegramMiniApp() || hasTelegramLaunchHints() || isTelegramUserAgentHint();
}

export function prepareTelegramWebApp() {
  ensureTelegramWebAppScript();
  const tg = getTgWebApp();
  try {
    tg?.ready?.();
    tg?.expand?.();
  } catch {
    // noop
  }
}

export async function requestTelegramContact(): Promise<boolean> {
  const tg = getTgWebApp();
  const requestContactFn = tg?.requestContact;
  if (!requestContactFn) return false;
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(ok);
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
