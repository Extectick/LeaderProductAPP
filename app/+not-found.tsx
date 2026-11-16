import { useRouter } from 'expo-router';
import { useContext, useEffect, useRef } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { clearLastServiceRoute } from '@/src/features/navigation/lastServiceRouteStorage';

/** Unknown routes recover automatically without exposing a dead-end screen. */
export default function NotFoundScreen() {
  const router = useRouter();
  const auth = useContext(AuthContext);
  const userId = auth?.profile?.id;
  const recovered = useRef<{userId: number | undefined} | null>(null);
  useEffect(() => {
    if (recovered.current?.userId === userId && recovered.current !== null) return;
    recovered.current = {userId};
    // Clear the synchronous restore cache before navigation. Disk persistence
    // may finish later and must not keep the user on an unknown route.
    void clearLastServiceRoute(userId);
    router.replace('/services');
  }, [router, userId]);
  return null;
}
