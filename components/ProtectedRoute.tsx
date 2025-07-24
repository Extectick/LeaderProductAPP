import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ensureAuth } from '../utils/auth';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    
    const checkAuth = async () => {
      try {
        const token = await ensureAuth();
        if (!token && isMounted) {
          router.replace('/AuthScreen');
          return;
        }
      } catch (e) {
        console.error('Auth check error:', e);
        if (isMounted) {
          router.replace('/AuthScreen');
        }
      } finally {
        if (isMounted) {
          setIsAuthChecked(true);
        }
      }
    };

    checkAuth();
    
    return () => {
      isMounted = false;
    };
  }, []);

  if (!isAuthChecked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#5a67d8" />
      </View>
    );
  }

  return <>{children}</>;
}
