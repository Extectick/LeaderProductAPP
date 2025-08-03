import {
  CreateClientProfileDto,
  CreateEmployeeProfileDto,
  CreateSupplierProfileDto,
  Department,
  User
} from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from './authFetch';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const PROFILE_KEY = 'profile';

export const createProfile = async (
  selectedType: 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE',
  profileData: CreateClientProfileDto | CreateSupplierProfileDto | CreateEmployeeProfileDto
): Promise<void> => {
  const response = await authFetch(`/users/profiles/${selectedType.toLowerCase()}`, {
    method: 'POST',
    body: profileData,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  console.log(response)
  if (!response) {
    const errorData = await response.message;
    let errorMessage = 'Не удалось создать профиль';
    
    if (response.status === 400) {
      errorMessage = errorData.message || 'Некорректные данные профиля';
    } else if (response.status === 409) {
      errorMessage = errorData.message || 'Профиль уже существует';
    }

    throw new Error(JSON.stringify({
      message: errorMessage,
      status: response.status
    }));
  }

  // При успешном создании обновляем профиль
  await getProfile();
};

// Получить список отделов
export const getDepartments = async (): Promise<Department[]> => {
  return await authFetch<Department[]>('/users/departments');
};

// Получить профиль пользователя
export const getProfile = async (): Promise<User | null> => {
  try {
    const profile = await authFetch<User>('/users/profile');
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
  } catch (error: any) {
    console.error('Ошибка получения профиля:', error);
    return null;
  }
};
