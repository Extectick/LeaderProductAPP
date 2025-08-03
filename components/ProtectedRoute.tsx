import { AuthContext, isValidProfile } from '@/context/AuthContext';
import { logAccessAttempt } from '@/utils/logger';
import { Redirect } from 'expo-router';
import { useContext, useEffect, useState } from 'react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [authStatus, setAuthStatus] = useState<'checking'|'authenticated'|'unauthenticated'|'blocked'>('checking');
  const auth = useContext(AuthContext);

  useEffect(() => {
    if (!auth) return;

    logAccessAttempt({
      isAuthenticated: auth.isAuthenticated,
      hasProfile: !!auth.profile,
      profileStatus: auth.profile?.profileStatus
    });

    if (auth.isLoading) return;

    if (!auth.isAuthenticated) {
      setAuthStatus('unauthenticated');
    } else if (auth.isAuthenticated && auth.profile && !isValidProfile(auth.profile)) {
      setAuthStatus('blocked');
    } else if (auth.isAuthenticated) {
      setAuthStatus('authenticated');
    }
  }, [auth]);

  if (authStatus === 'checking') {
    return null;
  }

  if (authStatus === 'unauthenticated') {
    return <Redirect href="/AuthScreen" />;
  }

  if (authStatus === 'blocked') {
    return <Redirect href={{ pathname: '/access-denied', params: { reason: 'profile_blocked' } }} />;
  }

  return <>{children}</>;
}
