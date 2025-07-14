import AsyncStorage from '@react-native-async-storage/async-storage';
import * as apiClient from '../app/apiClient';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

export async function register(email: string, password: string) {
  return apiClient.register(email, password);
}

export async function login(email: string, password: string) {
  const data = await apiClient.login(email, password);
  await saveTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function verify(email: string, code: string) {
  const data = await apiClient.verify(email, code);
  await saveTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function refreshToken() {
  const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error('No refresh token found');
  const data = await apiClient.refreshToken(refreshToken);
  await saveTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function logout() {
  const accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  if (!accessToken || !refreshToken) return;
  await apiClient.logout(accessToken, refreshToken);
  await clearTokens();
}

async function saveTokens(accessToken: string, refreshToken: string) {
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

async function clearTokens() {
  await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function getAccessToken() {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken() {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}
