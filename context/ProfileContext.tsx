import { getProfile } from '@/utils/userService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useState } from 'react';

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

  const fetchProfile = async (accessToken: string): Promise<Profile> => {
    void accessToken;
    setLoading(true);
    setError(null);
    try {
      const profileData = (await getProfile()) as Profile;
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileData));
      setProfile(profileData);
      return profileData;
    } catch (err) {
      setError('Failed to fetch profile');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const cached = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
      if (cached) {
        setProfile(JSON.parse(cached));
        return;
      }
      await fetchProfile('');
    } catch {
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
    void type;
    setError('Profile type switch is not implemented in ProfileContext');
  };

  return (
    <ProfileContext.Provider value={{ profile, loading, error, loadProfile, fetchProfile, clearProfile, selectProfileType }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
