// context/AuthContext.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import isEqual from 'lodash.isequal';
import React, { createContext, ReactNode, useEffect, useState } from 'react';

import { Profile } from '@/types/userTypes';
import { refreshToken } from '@/utils/tokenService';
import { getProfile } from '@/utils/userService';

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

export const isValidProfile = (profile: Profile | null): boolean => {
    if (!profile) return false;
    const hasProfile = !!profile.clientProfile || !!profile.supplierProfile || !!profile.employeeProfile;
    if (!hasProfile) return false;
    return true;
};

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
        let token = await AsyncStorage.getItem('accessToken');
        const profileJson = await AsyncStorage.getItem('profile');
        if (!isMounted) return;
        if (!token) {
          token = await refreshToken();
        }
        if (profileJson) {
          const parsedProfile: Profile = JSON.parse(profileJson);
          await setProfile(parsedProfile);
        }
        if (token) {
          let decoded: DecodedToken | null = null;
          try {
            decoded = jwtDecode<DecodedToken>(token);
          } catch (err) {
            const newToken = await refreshToken();
            if (newToken) {
              token = newToken;
              try {
                decoded = jwtDecode<DecodedToken>(token);
              } catch {
                setAuthenticated(false);
                return;
              }
            } else {
              setAuthenticated(false);
              return;
            }
          }
          const now = Math.floor(Date.now() / 1000);
          if (decoded?.exp && decoded.exp < now) {
            const newToken = await refreshToken();
            if (!newToken) {
              setAuthenticated(false);
              return;
            }
            token = newToken;
          }
          setAuthenticated(true);
          if (!profileJson) {
            try {
              await getProfile();
              const newProfileJson = await AsyncStorage.getItem('profile');
              if (newProfileJson) {
                const parsedProfile: Profile = JSON.parse(newProfileJson);
                await setProfile(parsedProfile);
              }
            } catch (e) {
              console.warn('Ошибка получения профиля:', e);
            }
          }
        } else {
          setAuthenticated(false);
        }
      } catch (e) {
        console.warn('Ошибка инициализации:', e);
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
    <AuthContext.Provider value={{ isLoading, isAuthenticated, profile: profileState, setAuthenticated, setProfile }}>
      {children}
    </AuthContext.Provider>
  );
};