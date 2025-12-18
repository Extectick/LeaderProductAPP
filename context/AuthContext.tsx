// context/AuthContext.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import isEqual from 'lodash.isequal';
import React, { createContext, ReactNode, useEffect, useState } from 'react';

import { Profile } from '@/types/userTypes';
import { handleBackendUnavailable, logout, refreshToken } from '@/utils/tokenService';
import { getProfile } from '@/utils/userService';

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
  // В текущей логике доступ в приложение дает только наличие профиля сотрудника
  return !!profile.employeeProfile;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [profileState, setProfileState] = useState<Profile | null>(null);
  
  
  const signOut = async () => {
    await logout();            // чистим токены/профиль в AsyncStorage
    setAuthenticated(false);   // контекст -> guest
    await setProfile(null);    // чистим профиль в контексте
  };
  const setProfile = async (newProfile: Profile | null) => {
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
  };

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        let token = await AsyncStorage.getItem('accessToken');
        const profileJson = await AsyncStorage.getItem('profile');

        if (!isMounted) return;

        // Если нет токена - попробовать обновить
        if (!token) {
          token = await refreshToken();
          if (!token) {
            await handleBackendUnavailable('Не удалось получить новый токен (сервер недоступен)');
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
            const newToken = await refreshToken();
            if (!newToken) {
              await handleBackendUnavailable('Не удалось обновить токен доступа');
              setAuthenticated(false);
              return;
            }
            // Токен обновлен - продолжаем с новым токеном
            token = newToken;
          }
          setAuthenticated(true);

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
              console.warn('Ошибка получения профиля:', e);
            }
          }
        } else {
          // Если нет токена - проверим refreshToken и покажем алерт при недоступности бэка
          await handleBackendUnavailable('Требуется подключение к серверу');
          setAuthenticated(false);
        }
      } catch (e) {
        console.warn('Ошибка инициализации:', e);
        await handleBackendUnavailable((e as any)?.message || 'Ошибка инициализации');
        if (!isMounted) return;
        setAuthenticated(false);
        setProfileState(null);
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
      }
    };


    init();
    return () => {
      isMounted = false;
    };
  }, []);

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
