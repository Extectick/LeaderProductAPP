export enum ProfileStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED'
}

export enum ProfileType {
  CLIENT = 'CLIENT',
  SUPPLIER = 'SUPPLIER',
  EMPLOYEE = 'EMPLOYEE'
}

export enum ActionType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  PASSWORD_RESET = 'PASSWORD_RESET',
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  OTHER = 'OTHER'
}

export enum QRStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DELETED = 'DELETED'
}

export enum QRType {
  PHONE = 'PHONE',
  LINK = 'LINK',
  EMAIL = 'EMAIL',
  TEXT = 'TEXT',
  WHATSAPP = 'WHATSAPP',
  CONTACT = 'CONTACT',
  TELEGRAM = 'TELEGRAM'
}

export interface Department {
  id: number;
  name: string;
  departmentRoles?: DepartmentRole[];
  employeeProfiles?: EmployeeProfile[];
}

export interface Address {
  id: number;
  street: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: number;
  name: string;
  permissions?: RolePermissions[];
  parentRoleId?: number;
  parentRole?: Role;
  childRoles?: Role[];
}

export interface Permission {
  id: number;
  name: string;
}

export interface RolePermissions {
  roleId: number;
  permissionId: number;
  permission: Permission;
  role: Role;
}

export interface User {
  id: number;
  email: string;
  passwordHash: string;
  isActive: boolean;
  roleId: number;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  avatarUrl?: string;
  deletedAt?: Date;
  currentProfileType?: ProfileType;
  profileStatus: ProfileStatus;
  role: Role;
  clientProfile?: ClientProfile;
  supplierProfile?: SupplierProfile;
  employeeProfile?: EmployeeProfile;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientProfile {
  id: number;
  userId: number;
  user: User;
  addressId?: number;
  address?: Address;
  phone?: string;
  status: ProfileStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierProfile {
  id: number;
  userId: number;
  user: User;
  addressId?: number;
  address?: Address;
  phone?: string;
  status: ProfileStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeeProfile {
  id: number;
  userId: number;
  user: User;
  departmentId?: number;
  department?: Department;
  departmentRoles?: DepartmentRole[];
  phone?: string;
  status: ProfileStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepartmentRole {
  id: number;
  userId: number;
  roleId: number;
  departmentId: number;
  user: User;
  role: Role;
  department: Department;
  employeeProfiles?: EmployeeProfile[];
}

export interface QRList {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: QRStatus;
  createdById: number;
  createdBy: User;
  qrData: string;
  qrType: QRType;
  description?: string;
}

export interface QRAnalytic {
  id: number;
  ip?: string;
  location?: string;
  browser?: string;
  device?: string;
  scanDuration?: number;
  createdAt: Date;
  qrListId: string;
  qrList: QRList;
}

export interface CreateEmployeeProfileDto {
  user: {
    firstName: string;
    lastName: string;
    middleName?: string;
  };
  phone?: string;
  departmentId: number;
}

export interface CreateClientProfileDto {
  user: {
    firstName: string;
    lastName?: string;
    middleName?: string;
  };
  phone?: string;
  address?: {
    street: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
  };
}

export interface CreateSupplierProfileDto {
  user: {
    firstName: string;
    lastName?: string;
    middleName?: string;
  };
  phone?: string;
  address?: {
    street: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
  };
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user?: User;
}
