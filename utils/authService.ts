// utils/authService.ts
import type {
  AuthMethodsResponseData,
  AuthLoginRequest,
  AuthLoginResponseData,
  AuthRegisterRequest,
  AuthVerifyRequest,
  AuthVerifyResponseData,
  MessengerQrAuthProvider,
  MessengerQrAuthStartResponseData,
  MessengerQrAuthStatusResponseData,
  PasswordResetRequestRequest,
  PasswordResetSubmitRequest,
} from '../types/apiTypes';
import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';
import { logout, saveTokens } from './tokenService';

function throwIfError<T>(res: { ok: boolean; message?: string; data?: T }): T {
  if (!res.ok) throw new Error(res.message || 'Unknown error');
  if (!res.data) throw new Error('Empty data from server');
  return res.data;
}

export async function login(email: string, password: string) {
  const res = await apiClient<AuthLoginRequest, AuthLoginResponseData>(API_ENDPOINTS.AUTH.LOGIN, {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  });
  console.log('res:', res);
  const data = throwIfError(res);
  // console.log('После авторизации : '+data.accessToken)
  await saveTokens(data.accessToken, data.refreshToken, data.profile);
}

export async function register(email: string, password: string, name: string) {
  const res = await apiClient<AuthRegisterRequest, void>(API_ENDPOINTS.AUTH.REGISTER, {
    method: 'POST',
    body: { email, password, name },
    skipAuth: true,
  });
  if (!res.ok) throw new Error(res.message);
}

export async function verify(email: string, code: string) {
  const res = await apiClient<AuthVerifyRequest, AuthVerifyResponseData>(API_ENDPOINTS.AUTH.VERIFY, {
    method: 'POST',
    body: { email, code },
    skipAuth: true,
  });
  const data = throwIfError(res);
  await saveTokens(data.accessToken, data.refreshToken, data.profile);
  return data.profile ?? null;
}

export async function resendVerification(email: string) {
  const res = await apiClient<{ email: string }, void>(API_ENDPOINTS.AUTH.RESEND, {
    method: 'POST',
    body: { email },
    skipAuth: true,
  });
  if (!res.ok) throw new Error(res.message || 'Ошибка отправки кода');
}

export async function requestPasswordReset(email: string) {
  const res = await apiClient<PasswordResetRequestRequest, void>(API_ENDPOINTS.PASSWORD_RESET.REQUEST, {
    method: 'POST',
    body: { email },
    skipAuth: true,
  });
  if (!res.ok) throw new Error(res.message || 'Ошибка запроса сброса пароля');
}

export async function verifyPasswordReset(email: string, code: string) {
  const res = await apiClient<{ email: string; code: string }, void>(API_ENDPOINTS.PASSWORD_RESET.VERIFY, {
    method: 'POST',
    body: { email, code },
    skipAuth: true,
  });
  if (!res.ok) throw new Error(res.message || 'Ошибка проверки кода');
}

export async function changePassword(email: string, code: string, newPassword: string) {
  const res = await apiClient<PasswordResetSubmitRequest, { message: string }>(API_ENDPOINTS.PASSWORD_RESET.CHANGE, {
    method: 'POST',
    body: { email, code, newPassword },
    skipAuth: true,
  });
  if (!res.ok) throw new Error(res.message || 'Ошибка изменения пароля');
  return res.data?.message;
}

export async function logoutUser() {
  try {
    await apiClient(API_ENDPOINTS.AUTH.LOGOUT, { method: 'POST' });
  } catch {
    // игнорировать ошибку
  } finally {
    await logout();
  }
}

export async function addCredentials(email: string, password: string) {
  const res = await apiClient<{ email: string; password: string }, void>(API_ENDPOINTS.AUTH.CREDENTIALS, {
    method: 'POST',
    body: { email, password },
  });
  if (!res.ok) throw new Error(res.message || 'Не удалось добавить email и пароль');
}

export async function getAuthMethods() {
  const res = await apiClient<void, AuthMethodsResponseData>(API_ENDPOINTS.AUTH.METHODS, {
    method: 'GET',
    skipAuth: true,
  });
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось получить способы входа');
  return res.data.methods || [];
}

function getQrStartEndpoint(provider: MessengerQrAuthProvider) {
  return provider === 'MAX'
    ? API_ENDPOINTS.AUTH.MAX_QR_START
    : API_ENDPOINTS.AUTH.TELEGRAM_QR_START;
}

function getQrStatusEndpoint(provider: MessengerQrAuthProvider) {
  return provider === 'MAX'
    ? API_ENDPOINTS.AUTH.MAX_QR_STATUS
    : API_ENDPOINTS.AUTH.TELEGRAM_QR_STATUS;
}

function getQrCancelEndpoint(provider: MessengerQrAuthProvider) {
  return provider === 'MAX'
    ? API_ENDPOINTS.AUTH.MAX_QR_CANCEL
    : API_ENDPOINTS.AUTH.TELEGRAM_QR_CANCEL;
}

export async function startMessengerQrAuth(provider: MessengerQrAuthProvider) {
  const res = await apiClient<void, MessengerQrAuthStartResponseData>(
    getQrStartEndpoint(provider),
    {
      method: 'POST',
      skipAuth: true,
    }
  );
  if (!res.ok || !res.data) {
    throw new Error(res.message || `Не удалось запустить QR-вход через ${provider}`);
  }
  return res.data;
}

export async function getMessengerQrAuthStatus(
  provider: MessengerQrAuthProvider,
  sessionToken: string
) {
  const token = String(sessionToken || '').trim();
  if (!token) throw new Error('sessionToken is required');

  const res = await apiClient<void, MessengerQrAuthStatusResponseData>(
    `${getQrStatusEndpoint(provider)}?sessionToken=${encodeURIComponent(token)}`,
    {
      method: 'GET',
      skipAuth: true,
    }
  );
  if (!res.ok || !res.data) {
    throw new Error(res.message || `Не удалось проверить QR-вход через ${provider}`);
  }
  return res.data;
}

export async function cancelMessengerQrAuth(
  provider: MessengerQrAuthProvider,
  sessionToken: string
) {
  const token = String(sessionToken || '').trim();
  if (!token) throw new Error('sessionToken is required');
  const res = await apiClient<{ sessionToken: string }, { cancelled: boolean }>(
    getQrCancelEndpoint(provider),
    {
      method: 'POST',
      body: { sessionToken: token },
      skipAuth: true,
    }
  );
  if (!res.ok || !res.data) {
    throw new Error(res.message || `Не удалось отменить QR-вход через ${provider}`);
  }
  return Boolean(res.data.cancelled);
}
