import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { getAccessToken } from '../utils/auth'; // Исправлено на getAccessToken

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const token = await getAccessToken();
      if (token) {
        setIsAuthenticated(true);
        router.replace('/tabs'); // Переход на основной экран после авторизации
      } else {
        setIsAuthenticated(false);
        router.replace('/AuthScreen'); // Переход на экран авторизации/регистрации
      }
      setLoading(false);
    }
    checkAuth();
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
