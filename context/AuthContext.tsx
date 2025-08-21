// context/AuthContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import isEqual from 'lodash.isequal';
import React, { createContext, ReactNode, useEffect, useState } from 'react';

import { Profile } from '@/types/userTypes';
import { getProfile } from '@/utils/userService';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  profile: Profile | null;
  setAuthenticated: (value: boolean) => void;
  setProfile: (profile: Profile | null) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
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
        if (token) setAuthenticated(true);
        if (profileJson) {
          const parsed: Profile = JSON.parse(profileJson);
          await setProfile(parsed);
        } else if (token) {
          try {
            await getProfile();
            const newProfileJson = await AsyncStorage.getItem('profile');
            if (newProfileJson) {
              const parsed: Profile = JSON.parse(newProfileJson);
              await setProfile(parsed);
            }
          } catch (e) {
            console.warn('Ошибка получения профиля:', e);
          }
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
