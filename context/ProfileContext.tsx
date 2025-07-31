import { getProfile } from '@/utils/authService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as apiClient from '../utils/apiClient';

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
  role: { id: number; name: string };
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
  fetchProfile: (accessToken: string) => Promise<Profile>;
  clearProfile: () => Promise<void>;
  selectProfileType: (type: ProfileType) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: false,
  error: null,
  loadProfile: async () => {},
  fetchProfile: async () => {
    throw new Error('Not implemented');
  },
  clearProfile: async () => {},
  selectProfileType: async () => {},
});

const PROFILE_STORAGE_KEY = 'userProfile';

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async (accessToken: string) => {
    const profileData = await getProfile();
    await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileData));

  };

  const loadProfile = async () => {
    setLoading(true);
    try {
      const token = await ensureAuth();
      if (token) {
        await fetchProfile(token);
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
    const token = await ensureAuth();
    if (!token) throw new Error('Not authenticated');

    setLoading(true);
    try {
      let createdProfile;
      switch (type) {
        case 'CLIENT':
          createdProfile = await apiClient.createClientProfile(token);
          break;
        case 'SUPPLIER':
          createdProfile = await apiClient.createSupplierProfile(token);
          break;
        case 'EMPLOYEE':
          // TODO: Можно добавить departmentId в будущем
          createdProfile = await apiClient.createEmployeeProfile(token, {
            firstName: 'Имя',
            lastName: 'Фамилия',
            middleName: null,
            departmentId: 1,
          });
          break;
        default:
          throw new Error('Invalid profile type');
      }

      // Обновляем данные профиля
      await fetchProfile(token);
    } catch (err) {
      setError('Failed to select profile type');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  return (
    <ProfileContext.Provider value={{ profile, loading, error, loadProfile, fetchProfile, clearProfile, selectProfileType }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
