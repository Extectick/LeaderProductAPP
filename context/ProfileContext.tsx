import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as apiClient from '../app/apiClient';
import { ensureAuth } from '../utils/auth';

type ProfileType = 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE' | null;

interface Profile {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  phone: string | null;
  avatarUrl: string | null;
  profileStatus: string;
  currentProfileType: ProfileType;
  role: {
    id: number;
    name: string;
  };
  departmentRoles: any[];
  clientProfile: any | null;
  supplierProfile: any | null;
  employeeProfile: any | null;
}

interface ProfileContextType {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  loadProfile: () => Promise<void>;
  clearProfile: () => Promise<void>;
  selectProfileType: (type: ProfileType) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: false,
  error: null,
  loadProfile: async () => {},
  clearProfile: async () => {},
  selectProfileType: async () => {},
});

const PROFILE_STORAGE_KEY = 'userProfile';

export const ProfileProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async (accessToken: string) => {
    try {
      const profileData = await apiClient.getProfile(accessToken);
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileData.profile));
      setProfile(profileData.profile);
      return profileData.profile;
    } catch (err) {
      setError('Failed to fetch profile');
      throw err;
    }
  };

  const loadProfile = async () => {
    setLoading(true);
    try {
      const storedProfile = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
      if (storedProfile) {
        setProfile(JSON.parse(storedProfile));
      } else {
        const token = await ensureAuth();
        if (token) {
          await fetchProfile(token);
        }
      }
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const clearProfile = async () => {
    await AsyncStorage.removeItem(PROFILE_STORAGE_KEY);
    setProfile(null);
  };

  const selectProfileType = async (type: ProfileType) => {
    if (!profile) return;
    
    setLoading(true);
    try {
      const token = await ensureAuth();
      if (!token) throw new Error('Not authenticated');
      
      // Здесь будет вызов API для обновления типа профиля
      // const updatedProfile = await apiClient.updateProfileType(type);
      // await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updatedProfile));
      // setProfile(updatedProfile);
    } catch (err) {
      setError('Failed to select profile type');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  return (
    <ProfileContext.Provider value={{ 
      profile, 
      loading, 
      error,
      loadProfile,
      clearProfile,
      selectProfileType
    }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
