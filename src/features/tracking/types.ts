import type { AdminUserItem } from '@/utils/userService';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type UserOption = Pick<
  AdminUserItem,
  | 'id'
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'middleName'
  | 'phone'
  | 'avatarUrl'
  | 'departmentName'
  | 'isOnline'
  | 'lastSeenAt'
  | 'role'
>;

export type Filters = {
  from: string;
  to: string;
  maxAccuracy: string;
  maxPoints: string;
};

export type DateField = 'from' | 'to';

export type PointLabel = {
  latitude: number;
  longitude: number;
  label: string;
};
