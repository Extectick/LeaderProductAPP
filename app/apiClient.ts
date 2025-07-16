import AsyncStorage from '@react-native-async-storage/async-storage';

import Constants from 'expo-constants';

const API_BASE_URL = Constants.expoConfig?.extra?.API_BASE_URL || 'http://192.168.30.54:3000';

if (!Constants.expoConfig?.extra?.API_BASE_URL) {
  console.warn('Using default API_BASE_URL. Please set API_BASE_URL in app.json');
}

async function getCSRFToken() {
  const token = await AsyncStorage.getItem('csrfToken');
  if (!token) {
    const newToken = Math.random().toString(36).substring(2);
    await AsyncStorage.setItem('csrfToken', newToken);
    return newToken;
  }
  return token;
}

const RATE_LIMIT_KEY = 'rateLimit';
const MAX_ATTEMPTS = 5;
const LOCK_TIME = 1 * 60 * 1000; // 1 minute

async function checkRateLimit() {
  const rateLimitData = await AsyncStorage.getItem(RATE_LIMIT_KEY);
  if (!rateLimitData) return;

  const { attempts, lastAttempt, lockedUntil } = JSON.parse(rateLimitData);
  
  if (lockedUntil && Date.now() < lockedUntil) {
    throw new Error(`Слишком много попыток. Попробуйте снова через ${Math.ceil((lockedUntil - Date.now()) / 60000)} минут`);
  }

  return { attempts, lastAttempt };
}

async function updateRateLimit() {
  const currentData = await checkRateLimit() || { attempts: 0 };
  const newAttempts = currentData.attempts + 1;
  
  let lockedUntil = null;
  if (newAttempts >= MAX_ATTEMPTS) {
    lockedUntil = Date.now() + LOCK_TIME;
  }

  await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify({
    attempts: newAttempts,
    lastAttempt: Date.now(),
    lockedUntil
  }));
}

async function resetRateLimit() {
  await AsyncStorage.removeItem(RATE_LIMIT_KEY);
}

async function request(endpoint: string, options: RequestInit) {
  // Проверяем rate limit для auth endpoints
  if (['/login', '/register', '/verify'].includes(endpoint)) {
    await checkRateLimit();
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const csrfToken = await getCSRFToken();
  
  const headers = {
    ...options.headers,
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json'
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });
    
    if (!response.ok) {
      // Обновляем счетчик неудачных попыток для auth endpoints
      if (['/login', '/register', '/verify'].includes(endpoint)) {
        await updateRateLimit();
      }
      
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.message || 'API request failed');
      throw error;
    }

    // Сбрасываем счетчик при успешной авторизации
    if (['/login', '/register', '/verify'].includes(endpoint)) {
      await resetRateLimit();
    }

    return response.json();
  } catch (error) {
    // Обработка network errors
    if (error instanceof TypeError && error.message.includes('Network request failed')) {
      throw new Error('Ошибка сети. Проверьте подключение к интернету');
    }
    throw error;
  }
}

export async function register(email: string, password: string) {
  return request('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string) {
  return request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function verify(email: string, code: string) {
  return request('/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
}

export async function refreshToken(refreshToken: string) {
  return request('/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
}

export async function logout(accessToken: string, refreshToken: string) {
  return request('/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ refreshToken }),
  });
}

export async function getProfile(accessToken: string) {
  const url = `${API_BASE_URL}/users/profile`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.message || 'API request failed');
    throw error;
  }
  return response.json();
}

const apiClient = {
  register,
  login,
  verify,
  refreshToken,
  logout,
  getProfile,
  API_BASE_URL,
};

export default apiClient;
