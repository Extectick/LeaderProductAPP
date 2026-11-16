import { useContext, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { clearLastServiceRoute } from '@/src/features/navigation/lastServiceRouteStorage';

export default function NotFoundScreen() {
  const router = useRouter();
  const auth = useContext(AuthContext);
  useEffect(() => {
    // Clear the in-memory restore target before navigating. Native storage must
    // not hold recovery hostage; no drafts or credentials are removed.
    void clearLastServiceRoute(auth?.profile?.id);
    router.replace('/services');
  }, [router, auth?.profile?.id]);
  return null;
}
