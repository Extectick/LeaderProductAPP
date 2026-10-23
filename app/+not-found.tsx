import { useRouter } from 'expo-router';
import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { NotFoundView } from '@/components/NotFoundView';
import { clearLastServiceRoute } from '@/src/features/navigation/lastServiceRouteStorage';

export default function NotFoundScreen() {
  const router = useRouter();
  const auth = useContext(AuthContext);
  const openServices = async () => {
    // Root 404 is outside the main navigator. Do not restore a stale service
    // when the main navigator mounts again after this explicit recovery action.
    await clearLastServiceRoute(auth?.profile?.id);
    router.replace('/services');
  };
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else return openServices();
  };

  return <NotFoundView onServices={openServices} onBack={goBack} />;
}
