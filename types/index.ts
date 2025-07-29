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