// context/AuthContext.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import isEqual from 'lodash.isequal';
import React, { createContext, ReactNode, useCallback, useEffect, useState } from 'react';

import { Profile } from '@/src/entities/user/types';
import { handleBackendUnavailable, logout, refreshToken } from '@/utils/tokenService';
import { getProfile } from '@/utils/userService';
import { getProfileGate } from '@/utils/profileGate';
import { syncPushToken, unregisterPushToken } from '@/utils/pushNotifications';
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { addMonitoringBreadcrumb, captureException } from '@/src/shared/monitoring';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  profile: Profile | null;
  setAuthenticated: (value: boolean) => void;
  setProfile: (profile: Profile | null) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

interface DecodedToken {
  exp?: number;
  [key: string]: any;
}

export const isValidProfile = (profile: Profile | null): boolean => {
  if (!profile) return false;
  return getProfileGate(profile) === 'active';
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [profileState, setProfileState] = useState<Profile | null>(null);

  const setProfile = useCallback(async (newProfile: Profile | null) => {
    // if (newProfile && !isValidProfile(newProfile)) {
    //   await logoutFn();
    //   setAuthenticated(false);
    //   newProfile = null;
    // }

    setProfileState((prev) => {
      if (isEqual(prev, newProfile)) return prev;
      return newProfile;
    });

    if (newProfile) {
      await AsyncStorage.setItem('profile', JSON.stringify(newProfile));
    } else {
      await AsyncStorage.removeItem('profile');
    }
  }, []);

  const signOut = async () => {
    addMonitoringBreadcrumb('auth_signout_start');
    try {
      await unregisterPushToken();
      await logout(); // чистим токены/профиль в AsyncStorage
    } catch (e) {
      captureException(e, { where: 'AuthProvider:signOut' });
      console.warn('Logout failed, continuing local sign out:', e);
    }
    setAuthenticated(false); // контекст -> guest
    await setProfile(null);  // чистим профиль в контексте
    addMonitoringBreadcrumb('auth_signout_done');
  };

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        addMonitoringBreadcrumb('auth_init_start');
        let token = await AsyncStorage.getItem('accessToken');
        const profileJson = await AsyncStorage.getItem('profile');

        if (!isMounted) return;

        // Если нет токена - попробовать обновить
        if (!token) {
          addMonitoringBreadcrumb('auth_refresh_attempt', { reason: 'no_access_token' });
          token = await refreshToken();
          if (!token) {
            await handleBackendUnavailable('Не удалось получить новый токен (сервер недоступен)');
            addMonitoringBreadcrumb('auth_refresh_failed', { reason: 'no_access_token' });
          }
        }

        // Всегда проверяем профиль, даже если нет токена
        if (profileJson) {
          const parsedProfile = JSON.parse(profileJson);
          // if (!isValidProfile(parsedProfile)) {
          //   await logoutFn();
          //   setAuthenticated(false);
          //   return;
          // }
          await setProfile(parsedProfile);
        }

        if (token) {
          const decoded: DecodedToken = jwtDecode(token);
          const now = Math.floor(Date.now() / 1000);

          if (decoded?.exp && decoded.exp < now) {
            // Токен просрочен - попробовать обновить
            addMonitoringBreadcrumb('auth_refresh_attempt', { reason: 'token_expired' });
            const newToken = await refreshToken();
            if (!newToken) {
              await handleBackendUnavailable('Не удалось обновить токен доступа');
              setAuthenticated(false);
              addMonitoringBreadcrumb('auth_refresh_failed', { reason: 'token_expired' });
              return;
            }
            // Токен обновлен - продолжаем с новым токеном
            token = newToken;
          }
          setAuthenticated(true);
          addMonitoringBreadcrumb('auth_authenticated');

          // Если нет профиля в AsyncStorage, но есть токен - получаем профиль
          if (!profileJson) {
            try {
              await getProfile();
              const profileJson = await AsyncStorage.getItem('profile')
              if (profileJson) {
                const parsedProfile = JSON.parse(profileJson);
                // if (!isValidProfile(parsedProfile)) {
                //     await logoutFn();
                //     setAuthenticated(false);
                //     return;
                // }
                await setProfile(parsedProfile);
              }
              
            } catch (e) {
              captureException(e, { where: 'AuthProvider:init:getProfile' });
              console.warn('Ошибка получения профиля:', e);
            }
          }
        } else {
          // Если нет токена - проверим refreshToken и покажем алерт при недоступности бэка
          await handleBackendUnavailable('Требуется подключение к серверу');
          setAuthenticated(false);
          addMonitoringBreadcrumb('auth_guest_mode');
        }
      } catch (e) {
        captureException(e, { where: 'AuthProvider:init' });
        console.warn('Ошибка инициализации:', e);
        await handleBackendUnavailable((e as any)?.message || 'Ошибка инициализации');
        if (!isMounted) return;
        setAuthenticated(false);
        setProfileState(null);
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
        addMonitoringBreadcrumb('auth_init_done');
      }
    };


    init();
    return () => {
      isMounted = false;
    };
  }, [setProfile]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const freshProfile = await getProfile();
        if (!cancelled && freshProfile) {
          await setProfile(freshProfile);
        }
      } catch {}
    };

    const interval = setInterval(refresh, 25000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthenticated, setProfile]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await syncPushToken();
        if (!token || cancelled) return;
      } catch (e) {
        console.warn('Push token sync failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  usePresenceHeartbeat(isAuthenticated);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        profile: profileState,
        setAuthenticated,
        setProfile,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

