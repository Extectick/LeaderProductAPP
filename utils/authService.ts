// utils/authService.ts
import {
  ErrorResponse,
  SuccessResponse
} from './../types/apiResponseTypes';
import type {
  AuthLoginRequest,
  AuthLoginResponseData,
  AuthRegisterRequest,
  AuthVerifyRequest,
  AuthVerifyResponseData
} from './../types/apiTypes';
import { API_ENDPOINTS } from './apiEndpoints';
import { authFetch } from './authFetch';
import { logout as logoutTokensOnly, saveTokens } from './tokenService';

export const login = async (email: string, password: string) => {
  try {
    const response = await authFetch<AuthLoginRequest, AuthLoginResponseData>(
      API_ENDPOINTS.AUTH.LOGIN,
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorResponse = response as ErrorResponse;
      throw new Error(errorResponse.message);
    }

    const successResponse = response as SuccessResponse<AuthLoginResponseData>;
    const { accessToken, refreshToken, profile } = successResponse.data;
    await saveTokens(accessToken, refreshToken, profile);
    console.log('Устанавливаются данные в AsyncStorage после авторизации');
  } catch (e: any) {
    throw new Error(e.message || 'Ошибка авторизации');
  }
};

export const register = async (email: string, password: string, name: string) => {
  const response = await authFetch<AuthRegisterRequest, void>(
    API_ENDPOINTS.AUTH.REGISTER,
    {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    const errorResponse = response as ErrorResponse;
    throw new Error(errorResponse.message);
  }
};

export const verify = async (email: string, code: string) => {
  const response = await authFetch<AuthVerifyRequest, AuthVerifyResponseData>(
    API_ENDPOINTS.AUTH.VERIFY,
    {
      method: 'POST',
      body: JSON.stringify({ email, code }),
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    const errorResponse = response as ErrorResponse;
    throw new Error(errorResponse.message);
  }

  const { data: { accessToken, refreshToken} } = response;

  await saveTokens(accessToken, refreshToken);
};

export const logout = async () => {
  try {
    await authFetch(API_ENDPOINTS.AUTH.LOGOUT, { method: 'POST' });
  } catch (e) {
    // Ignore errors
  } finally {
    await logoutTokensOnly();
  }
};
