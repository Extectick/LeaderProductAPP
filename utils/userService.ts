import { UserProfileResponse } from '@/types/apiTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorResponse, SuccessResponse } from '../types/apiResponseTypes';
import { Profile } from '../types/userTypes';
import { authFetch } from './authFetch';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const PROFILE_KEY = 'profile';

interface UserProfile {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  clientProfile?: {
    phone: string | null;
    status: string;
    address?: {
      street: string;
      city: string;
      country: string;
    };
    user?: {
      firstName: string;
      lastName: string;
      middleName?: string;
    };
  };
  supplierProfile?: {
    phone: string | null;
    status: string;
    address?: {
      street: string;
      city: string;
      country: string;
    };
    user?: {
      firstName: string;
      lastName: string;
      middleName?: string;
    };
  };
  employeeProfile?: {
    phone: string | null;
    status: string;
    departmentId?: number;
    user?: {
      firstName: string;
      lastName: string;
      middleName?: string;
    };
  };
}

export type CreateClientProfileDto = NonNullable<UserProfile['clientProfile']>;
export type CreateSupplierProfileDto = NonNullable<UserProfile['supplierProfile']>;
export type CreateEmployeeProfileDto = NonNullable<UserProfile['employeeProfile']>;
export type Department = {
  id: number;
  name: string;
};
export type User = UserProfile;

export const createProfile = async (
  selectedType: 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE',
  profileData: CreateClientProfileDto | CreateSupplierProfileDto | CreateEmployeeProfileDto
): Promise<void> => {
  const response = await authFetch<
    CreateClientProfileDto | CreateSupplierProfileDto | CreateEmployeeProfileDto, 
    void
  >(`/users/profiles/${selectedType.toLowerCase()}`, {
    method: 'POST',
    body: JSON.stringify(profileData),
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorResponse = response as unknown as ErrorResponse;
    throw new Error(JSON.stringify({
      message: errorResponse.message,
      code: errorResponse.error.code,
      details: errorResponse.error.details
    }));
  }

  // При успешном создании обновляем профиль
  await getProfile();
};

export const getDepartments = async (): Promise<Department[]> => {
  const response = await authFetch<void, Department[]>('/users/departments');
  if (!response.ok) {
    const errorResponse = response as ErrorResponse;
    throw new Error(errorResponse.message);
  }
  return response.data;
};

export const getProfile = async (): Promise<Profile | null> => {
  try {
    const response = await authFetch<void, UserProfileResponse>('/users/profile');
    if (!response.ok) {
      const errorResponse = response as ErrorResponse;
      throw new Error(errorResponse.message);
    }
    const responseData = (response as unknown as SuccessResponse<{ profile: Profile }>).data;
    const profile = responseData.profile;
    console.log("Профиль пользователя:", profile);
    

    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
  } catch (error: any) {
    console.error('Ошибка получения профиля:', error);
    return null;
  }
};
