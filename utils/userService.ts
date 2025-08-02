import { ClientProfile, EmployeeProfile, SupplierProfile } from '@/types';
import { authFetch } from './authFetch';

export const createProfile = async (
  selectedType: 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE',
  profileData: ClientProfile | SupplierProfile | EmployeeProfile
): Promise<void> => {
  console.log(profileData)
  await authFetch(`/users/profiles/${selectedType.toLowerCase()}`, {
    method: 'POST',
    body: JSON.stringify(profileData),
    headers: {
      'Content-Type': 'application/json'
    }
  });
};
