import type { Profile, ProfileStatus, ProfileType } from '@/src/entities/user/types';

export type ActiveProfileInfo = {
  type: ProfileType | null;
  status: ProfileStatus | null;
  profile: Profile['clientProfile'] | Profile['supplierProfile'] | Profile['employeeProfile'] | null;
};

export type ProfileGate = 'none' | 'pending' | 'blocked' | 'active';

export const resolveActiveProfile = (profile: Profile | null): ActiveProfileInfo => {
  if (!profile) {
    return { type: null, status: null, profile: null };
  }

  const type = profile.currentProfileType ?? null;
  if (!type) return { type: null, status: null, profile: null };

  if (type === 'CLIENT') {
    return { type, status: profile.clientProfile?.status ?? null, profile: profile.clientProfile ?? null };
  }
  if (type === 'SUPPLIER') {
    return { type, status: profile.supplierProfile?.status ?? null, profile: profile.supplierProfile ?? null };
  }
  if (type === 'EMPLOYEE') {
    return { type, status: profile.employeeProfile?.status ?? null, profile: profile.employeeProfile ?? null };
  }

  return { type: null, status: null, profile: null };
};

export const getProfileGate = (profile: Profile | null): ProfileGate => {
  if (!profile) return 'none';
  if (profile.profileStatus === 'BLOCKED') return 'blocked';
  if (profile.profileStatus === 'PENDING') return 'pending';

  const active = resolveActiveProfile(profile);
  if (!active.type || !active.profile) return 'none';

  if (active.status === 'BLOCKED') return 'blocked';
  if (active.status === 'PENDING') return 'pending';
  if (active.status === 'ACTIVE') return 'active';

  return 'none';
};

