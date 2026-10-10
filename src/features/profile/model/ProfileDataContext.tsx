import React from 'react';
import { AuthContext } from '@/context/AuthContext';
import type { Profile } from '@/src/entities/user/types';
import { getProfile } from '@/utils/userService';

type ProfileData = { profile: Profile | null; loading: boolean; error: string | null; refresh: () => Promise<void>; update: (profile: Profile) => void };
const Context = React.createContext<ProfileData | null>(null);

/** Auth owns the user-scoped, persisted profile. Never race a second cache hydration against a fresh response. */
export function ProfileDataProvider({ children }: React.PropsWithChildren) {
  const auth = React.useContext(AuthContext);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const authRef = React.useRef(auth);
  authRef.current = auth;
  const inFlight = React.useRef(false);
  const alive = React.useRef(true);
  const refresh = React.useCallback(async () => {
    if (inFlight.current) return;
    const userId = authRef.current?.profile?.id;
    inFlight.current = true; setLoading(true); setError(null);
    try {
      const next = await getProfile();
      if (!alive.current || authRef.current?.profile?.id !== userId) return;
      if (next && (!userId || next.id === userId)) await authRef.current?.setProfile(next);
      else if (!authRef.current?.profile) setError('Не удалось загрузить профиль');
    } catch {
      if (alive.current && !authRef.current?.profile) setError('Не удалось загрузить профиль');
    } finally { inFlight.current = false; if (alive.current) setLoading(false); }
  }, []);
  React.useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false; }; }, [refresh]);
  const update = React.useCallback((next: Profile) => {
    if (next.id === authRef.current?.profile?.id) void authRef.current.setProfile(next);
  }, []);
  return <Context.Provider value={{ profile: auth?.profile ?? null, loading, error, refresh, update }}>{children}</Context.Provider>;
}
export function useProfileData() {
  const value = React.useContext(Context);
  if (!value) throw new Error('ProfileDataProvider is required');
  return value;
}
