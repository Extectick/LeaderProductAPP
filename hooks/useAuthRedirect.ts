// hooks/useAuthRedirect.ts
// Simplified version that no longer relies on `isValidProfile` exported from AuthContext.
// Instead, define a local helper to determine if a user has a valid profile.
import { useContext, useMemo } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { Profile } from '@/types/userTypes';

export type Gate = 'guest' | 'needsProfile' | 'ready';

/**
 * Local helper to check whether the profile has at least one of the expected
 * sub-profiles. The original implementation lived in AuthContext but may no
 * longer be exported, so the check is reproduced here to avoid undefined imports.
 */
function isValidProfile(profile: Profile | null): boolean {
  if (!profile) return false;
  return !!(profile.clientProfile || profile.supplierProfile || profile.employeeProfile);
}

export const useAuthGate = () => {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext is required');

  const { isLoading, isAuthenticated, profile } = auth;

  const hasValidProfile = useMemo(() => isValidProfile(profile), [profile]);

  const gate: Gate = !isAuthenticated
    ? 'guest'
    : hasValidProfile
    ? 'ready'
    : 'needsProfile';

  return { isLoading, gate, isAuthenticated, hasValidProfile, profile };
};