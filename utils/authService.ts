// utils/authService.ts
import type {
  AuthLoginRequest,
  AuthLoginResponseData,
  AuthRegisterRequest,
  AuthVerifyRequest,
  AuthVerifyResponseData,
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
  await saveTokens(data.accessToken, data.refreshToken);
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
