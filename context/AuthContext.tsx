// context/AuthContext.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import isEqual from 'fast-deep-equal';
import { jwtDecode } from 'jwt-decode';
import React, { createContext, ReactNode, useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { Profile } from '@/src/entities/user/types';
import { getAccessToken, getRefreshToken, handleBackendUnavailable, hasAuthSessionExpired, logout, onAuthSessionExpired, refreshToken } from '@/utils/tokenService';
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

const PROFILE_REFRESH_INTERVAL_MS = 5 * 60_000;
const INITIAL_PROFILE_REFRESH_DELAY_MS = 10_000;

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
    return onAuthSessionExpired((event) => {
      addMonitoringBreadcrumb('auth_session_expired', {
        status: event.status,
        reason: event.reason,
      });
      setAuthenticated(false);
      setProfileState(null);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      let cachedProfile: Profile | null = null;
      let storedRefreshToken: string | null = null;
      try {
        addMonitoringBreadcrumb('auth_init_start');
        let token = await getAccessToken();
        storedRefreshToken = await getRefreshToken();
        const profileJson = await AsyncStorage.getItem('profile');

        if (!isMounted) return;

        if (profileJson) {
          cachedProfile = JSON.parse(profileJson) as Profile;
          await setProfile(cachedProfile);
        }

        if (!token && storedRefreshToken) {
          addMonitoringBreadcrumb('auth_refresh_attempt', { reason: 'no_access_token' });
          token = await refreshToken();
          if (!token) {
            addMonitoringBreadcrumb('auth_refresh_failed', { reason: 'no_access_token' });
            if (hasAuthSessionExpired()) {
              setAuthenticated(false);
              setProfileState(null);
              return;
            }
            await handleBackendUnavailable('Не удалось обновить сессию: API недоступен.');
            if (cachedProfile) {
              setAuthenticated(true);
              addMonitoringBreadcrumb('auth_offline_session_restored', { reason: 'no_access_token' });
              return;
            }
          }
        }

        if (token) {
          const decoded: DecodedToken = jwtDecode(token);
          const now = Math.floor(Date.now() / 1000);

          if (decoded?.exp && decoded.exp < now) {
            // Токен просрочен - попробовать обновить
            addMonitoringBreadcrumb('auth_refresh_attempt', { reason: 'token_expired' });
            const newToken = await refreshToken();
            if (!newToken) {
              addMonitoringBreadcrumb('auth_refresh_failed', { reason: 'token_expired' });
              if (hasAuthSessionExpired()) {
                setAuthenticated(false);
                setProfileState(null);
                return;
              }
              await handleBackendUnavailable('Не удалось обновить сессию: API недоступен.');
              if (cachedProfile && storedRefreshToken) {
                setAuthenticated(true);
                addMonitoringBreadcrumb('auth_offline_session_restored', { reason: 'token_expired' });
                return;
              }
              setAuthenticated(false);
              return;
            }
            token = newToken;
          }
          setAuthenticated(true);
          addMonitoringBreadcrumb('auth_authenticated');

          if (!cachedProfile) {
            try {
              await getProfile();
              const refreshedProfileJson = await AsyncStorage.getItem('profile');
              if (refreshedProfileJson) {
                const parsedProfile = JSON.parse(refreshedProfileJson);
                await setProfile(parsedProfile);
              }
            } catch (e) {
              captureException(e, { where: 'AuthProvider:init:getProfile' });
              console.warn('Ошибка получения профиля:', e);
            }
          }
        } else {
          setAuthenticated(false);
          addMonitoringBreadcrumb('auth_guest_mode');
        }
      } catch (e) {
        captureException(e, { where: 'AuthProvider:init' });
        console.warn('Ошибка инициализации:', e);
        await handleBackendUnavailable((e as any)?.message || 'Ошибка инициализации');
        if (!isMounted) return;
        if (cachedProfile && storedRefreshToken && !hasAuthSessionExpired()) {
          await setProfile(cachedProfile);
          setAuthenticated(true);
          addMonitoringBreadcrumb('auth_offline_session_restored', { reason: 'init_error' });
        } else {
          setAuthenticated(false);
          if (hasAuthSessionExpired()) setProfileState(null);
        }
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
    let refreshing = false;
    let lastRefreshAt = 0;
    const refresh = async () => {
      if (cancelled || refreshing || AppState.currentState !== 'active') return;
      const now = Date.now();
      if (now - lastRefreshAt < PROFILE_REFRESH_INTERVAL_MS) return;
      lastRefreshAt = now;
      refreshing = true;
      try {
        const freshProfile = await getProfile();
        if (!cancelled && freshProfile) {
          await setProfile(freshProfile);
        }
      } catch {
        // The cached profile remains valid while the API is unavailable.
      } finally {
        refreshing = false;
      }
    };

    const initialTimer = setTimeout(() => void refresh(), INITIAL_PROFILE_REFRESH_DELAY_MS);
    const interval = setInterval(() => void refresh(), PROFILE_REFRESH_INTERVAL_MS);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      appStateSubscription.remove();
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

