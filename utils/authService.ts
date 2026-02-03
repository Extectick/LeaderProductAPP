// utils/authService.ts
import type {
  AuthLoginRequest,
  AuthLoginResponseData,
  AuthRegisterRequest,
  AuthVerifyRequest,
  AuthVerifyResponseData,
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
