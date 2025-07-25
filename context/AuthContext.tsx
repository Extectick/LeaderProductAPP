import { Profile } from '@/types';
import { logout as logoutFn } from '@/utils/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useEffect, useState } from 'react';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  profile: Profile | null;
  setAuthenticated: (value: boolean) => void;
  setProfile: (profile: Profile | null) => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [profile, setProfileState] = useState<Profile | null>(null);

  const setProfile = async (newProfile: Profile | null) => {
    // Избегаем лишних обновлений, если профиль не меняется
    setProfileState((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(newProfile)) return prev;
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
          setAuthenticated(true);

          const parsedProfile = profileJson ? JSON.parse(profileJson) : null;
          // Проверяем, чтобы не обновлять профиль, если он уже такой же
          setProfileState((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(parsedProfile)) {
              return prev;
            }
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
      value={{ isLoading, isAuthenticated, profile, setAuthenticated, setProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};

