// context/AuthContext.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import isEqual from 'lodash.isequal';
import React, { createContext, ReactNode, useEffect, useState } from 'react';

import { Profile } from '@/types';
import { logout as logoutFn } from '@/utils/authService';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  profile: Profile | null;
  setAuthenticated: (value: boolean) => void;
  setProfile: (profile: Profile | null) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

interface DecodedToken {
  exp?: number;
  [key: string]: any;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [profileState, setProfileState] = useState<Profile | null>(null);

  const setProfile = async (newProfile: Profile | null) => {
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
        const token = await AsyncStorage.getItem('accessToken');
        const profileJson = await AsyncStorage.getItem('profile');

        if (!isMounted) return;

        if (token) {
          const decoded: DecodedToken = jwtDecode(token);
          const now = Math.floor(Date.now() / 1000);

          if (decoded?.exp && decoded.exp < now) {
            // Токен просрочен
            await logoutFn();
            setAuthenticated(false);
            setProfileState(null);
            return;
          }

          setAuthenticated(true);

          const parsedProfile = profileJson ? JSON.parse(profileJson) : null;
          setProfileState((prev) => {
            if (isEqual(prev, parsedProfile)) return prev;
            return parsedProfile;
          });
        } else {
          setAuthenticated(false);
          setProfileState(null);
        }
      } catch (e) {
        console.warn('Ошибка инициализации:', e);
        await logoutFn();
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
