import { AuthContext } from '@/context/AuthContext';
import { getProfileGate } from '@/utils/profileGate';
import { logAccessAttempt } from '@/utils/logger';
import { Redirect } from 'expo-router';
import { useContext, useEffect, useState } from 'react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [authStatus, setAuthStatus] = useState<'checking'|'authenticated'|'unauthenticated'|'blocked'|'pending'|'none'>('checking');
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
    } else if (auth.isAuthenticated) {
      const gate = getProfileGate(auth.profile);
      if (gate === 'blocked') setAuthStatus('blocked');
      else if (gate === 'pending') setAuthStatus('pending');
      else if (gate === 'none') setAuthStatus('none');
      else setAuthStatus('authenticated');
    }
  }, [auth]);

  if (authStatus === 'checking') {
    return null;
  }

  if (authStatus === 'unauthenticated') {
    return <Redirect href="/AuthScreen" />;
  }

  if (authStatus === 'blocked') {
    return <Redirect href="/ProfileBlockedScreen" />;
  }

  if (authStatus === 'pending') {
    return <Redirect href="/ProfilePendingScreen" />;
  }

  if (authStatus === 'none') {
    return <Redirect href="/ProfileSelectionScreen" />;
  }

  return <>{children}</>;
}
