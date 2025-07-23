import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ensureAuth } from '../utils/auth';

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuthAndProfile() {
      try {
        const token = await ensureAuth();
        if (!token) {
          router.replace('/AuthScreen');
          return;
        }

        // const profile = await getProfile();
        // if (!profile?.currentProfileType) {
        //   router.replace('/ProfileSelectionScreen');
        // } else {
        //   console.log(profile.currentProfileType)
        //   router.replace('/tabs');
        // }
        router.replace('/tabs');
      } catch (error) {
        // console.error('Ошибка при проверке авторизации и профиля:', error);
        router.replace('/AuthScreen');
      } finally {
        setLoading(false);
      }
    }

    checkAuthAndProfile();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return null;
}
