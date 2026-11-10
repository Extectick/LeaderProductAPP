import { primeOwnAvatar, clearAvatarMemory } from '@/src/shared/avatar/avatarSource';
import { acceptOwnProfile, isCurrentOwnProfile, persistOwnProfile, resetOwnProfileSession, ownProfileFence, ownProfileSessionMatches } from '@/src/features/profile/model/ownProfileCache';
// context/AuthContext.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import isEqual from 'fast-deep-equal';
import { jwtDecode } from 'jwt-decode';
import React, { createContext, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { Profile } from '@/src/entities/user/types';
import { getAccessToken, getRefreshToken, handleBackendUnavailable, hasAuthSessionExpired, logout, onAuthSessionExpired, refreshToken } from '@/utils/tokenService';
import { getProfile } from '@/utils/userService';
import { getProfileGate } from '@/utils/profileGate';
import { unregisterPushToken } from '@/utils/pushNotifications';
import {startPushTokenRegistration} from '@/utils/pushRegistration';
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { addMonitoringBreadcrumb, captureException, setMonitoringUser } from '@/src/shared/monitoring';
import { startOrderOutbox, stopOrderOutbox } from '@/src/features/clientOrders/offline/orderOutbox';

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
  const stopPushRegistration=useRef<(()=>void)|null>(null);
  const outboxProfileActive = isValidProfile(profileState);
  useEffect(() => {
    if (!isLoading && isAuthenticated && isValidProfile(profileState)) startOrderOutbox(String(profileState!.id));
    else stopOrderOutbox();
    return stopOrderOutbox;
  }, [isLoading, isAuthenticated, profileState?.id, outboxProfileActive]);

  const setProfile = useCallback(async (newProfile: Profile | null) => {
    if (newProfile) {
      if (!acceptOwnProfile(newProfile) || !isCurrentOwnProfile(newProfile)) return;
    } else resetOwnProfileSession();
    setProfileState(prev => isEqual(prev, newProfile) ? prev : newProfile);
    await Promise.all([setMonitoringUser(newProfile?.id), persistOwnProfile(newProfile)]);
  }, []);

  const signOut = useCallback(async () => {
    stopPushRegistration.current?.();stopPushRegistration.current=null;
    stopOrderOutbox();
    addMonitoringBreadcrumb('auth_signout_start');
    await setMonitoringUser(null);
    try {
      const { stopTrackingV2 } = await import('@/utils/trackingV2Service');
      await stopTrackingV2({ revoke: true });
    } catch (e) {
      captureException(e, { where: 'AuthProvider:stopTrackingV2' });
    }
    try {
      await unregisterPushToken();
    } catch (e) {
      captureException(e, { where: 'AuthProvider:signOut' });
    }
    clearAvatarMemory();
    await logout(); // локальный выход обязан завершиться даже при недоступном API
    setAuthenticated(false); // контекст -> guest
    await setProfile(null);  // чистим профиль в контексте
    addMonitoringBreadcrumb('auth_signout_done');
  }, [setProfile]);

  useEffect(() => {
    return onAuthSessionExpired((event) => {
      stopPushRegistration.current?.();stopPushRegistration.current=null;
      stopOrderOutbox();
      void setMonitoringUser(null);
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
      const initFence = ownProfileFence();
      // An explicit login/logout or confirmed expiry supersedes this restore,
      // even if one of its storage/network operations finishes afterwards.
      const isCurrentInit = () => isMounted && ownProfileSessionMatches(initFence);
      let cachedProfile: Profile | null = null;
      let storedRefreshToken: string | null = null;
      try {
        addMonitoringBreadcrumb('auth_init_start');
        let token = await getAccessToken();
        if (!isCurrentInit()) return;
        storedRefreshToken = await getRefreshToken();
        if (!isCurrentInit()) return;
        const profileJson = await AsyncStorage.getItem('profile');

        if (!isCurrentInit()) return;

        if (profileJson) {
          cachedProfile = JSON.parse(profileJson) as Profile;
          // Read only the local avatar cache while the auth gate is still closed.
          // The transport validates the current token's account and never downloads here.
          if (token || storedRefreshToken) await primeOwnAvatar(cachedProfile);
          if (!isCurrentInit() || hasAuthSessionExpired()) return;
          await setProfile(cachedProfile);
          if (!isCurrentInit()) return;
        }

        if (!token && storedRefreshToken) {
          addMonitoringBreadcrumb('auth_refresh_attempt', { reason: 'no_access_token' });
          token = await refreshToken();
          if (!isCurrentInit()) return;
          if (!token) {
            addMonitoringBreadcrumb('auth_refresh_failed', { reason: 'no_access_token' });
            if (hasAuthSessionExpired()) {
              setAuthenticated(false);
              setProfileState(null);
              return;
            }
            await handleBackendUnavailable('Не удалось обновить сессию: API недоступен.');
            if (!isCurrentInit()) return;
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
            if (!isCurrentInit()) return;
            if (!newToken) {
              addMonitoringBreadcrumb('auth_refresh_failed', { reason: 'token_expired' });
              if (hasAuthSessionExpired()) {
                setAuthenticated(false);
                setProfileState(null);
                return;
              }
              await handleBackendUnavailable('Не удалось обновить сессию: API недоступен.');
              if (!isCurrentInit()) return;
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
              if (!isCurrentInit()) return;
              const refreshedProfileJson = await AsyncStorage.getItem('profile');
              if (!isCurrentInit()) return;
              if (refreshedProfileJson) {
                const parsedProfile = JSON.parse(refreshedProfileJson);
                await setProfile(parsedProfile);
              }
            } catch (e) {
              if (!isCurrentInit()) return;
              captureException(e, { where: 'AuthProvider:init:getProfile' });
              console.warn('Ошибка получения профиля:', e);
            }
          }
        } else {
          setAuthenticated(false);
          addMonitoringBreadcrumb('auth_guest_mode');
        }
      } catch (e) {
        if (!isCurrentInit()) return;
        captureException(e, { where: 'AuthProvider:init' });
        console.warn('Ошибка инициализации:', e);
        await handleBackendUnavailable((e as any)?.message || 'Ошибка инициализации');
        if (!isCurrentInit()) return;
        if (cachedProfile && storedRefreshToken && !hasAuthSessionExpired()) {
          await setProfile(cachedProfile);
          if (!isCurrentInit()) return;
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
        const freshProfile = await getProfile({ force: true });
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

  useEffect(()=>{
    const userId=Number(profileState?.id);
    if(!isAuthenticated||!Number.isSafeInteger(userId)||userId<=0)return;
    const stop=startPushTokenRegistration(userId);stopPushRegistration.current=stop;
    return()=>{stop();if(stopPushRegistration.current===stop)stopPushRegistration.current=null;};
  },[isAuthenticated,profileState?.id]);

  usePresenceHeartbeat(isAuthenticated);
  const value = useMemo(() => ({ isLoading, isAuthenticated, profile: profileState, setAuthenticated, setProfile, signOut }),
    [isLoading, isAuthenticated, profileState, setAuthenticated, setProfile, signOut]);

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
};

