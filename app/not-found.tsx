import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    // Редирект, например, на страницу авторизации или на выбор профиля
    router.replace('/(auth)/AuthScreen');
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
