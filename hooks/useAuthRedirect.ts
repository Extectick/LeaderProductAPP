import { AuthContext, isValidProfile } from '@/context/AuthContext';
import { logAccessAttempt } from '@/utils/logger';
import { RelativePathString, useRouter } from 'expo-router';
import { useContext, useEffect } from 'react';

export const useAuthRedirect = () => {
  const auth = useContext(AuthContext);
  const router = useRouter();

  if (!auth) throw new Error('AuthContext is required');

  const { isLoading, isAuthenticated, profile } = auth;

  useEffect(() => {
    if (isLoading) return;

    const currentRoute = router.canGoBack() ? 'unknown' : 'initial';
    
    logAccessAttempt({
      isAuthenticated,
      hasProfile: !!profile,
      profileStatus: profile?.profileStatus,
      route: currentRoute
    });

    if (!isAuthenticated) {
      router.replace('/AuthScreen');
    } else if (isAuthenticated && (!isValidProfile(profile))) {
      router.replace('/ProfileSelectionScreen');
    } else if (isAuthenticated && isValidProfile(profile)) {
      router.replace('/home' as RelativePathString);
    }
  }, [isLoading, isAuthenticated, profile]);
};
