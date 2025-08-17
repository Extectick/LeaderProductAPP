// hooks/useAuthRedirect.ts
import { AuthContext, isValidProfile } from '@/context/AuthContext';
import { useContext, useMemo } from 'react';

export type Gate = 'guest' | 'needsProfile' | 'ready';

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
