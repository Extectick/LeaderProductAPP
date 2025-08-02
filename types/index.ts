export interface Department {
  id: number;
  name: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  profile?: Profile;
}

export interface ClientProfile {
  firstName: string;
  phone?: string;
}

export interface SupplierProfile {
  firstName: string;
  phone?: string;
}

export interface EmployeeProfile {
  surname: string;
  firstName: string;
  patronymic?: string;
  phone: string;
  departmentId: string;
}
