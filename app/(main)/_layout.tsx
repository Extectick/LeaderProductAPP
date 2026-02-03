// app/(main)/_layout.tsx
import Navigation from '@/components/Navigation/Navigation';
import { AuthContext } from '@/context/AuthContext';
import { getProfileGate } from '@/utils/profileGate';
import { useRouter } from 'expo-router';
import React, { useContext, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

export default function MainLayout() {
  const router = useRouter();
  const auth = useContext(AuthContext);

  useEffect(() => {
    if (!auth) return;
    if (auth.isLoading) return;

    const gate = getProfileGate(auth.profile);
    if (!auth.isAuthenticated) {
      router.replace('/(auth)/AuthScreen' as any);
    } else if (gate === 'pending') {
      router.replace('/(auth)/ProfilePendingScreen' as any);
    } else if (gate === 'blocked') {
      router.replace('/(auth)/ProfileBlockedScreen' as any);
    } else if (gate === 'none') {
      router.replace('/ProfileSelectionScreen' as any);
    }
  }, [auth, router]);

  return (
    <View style={styles.container}>

      {/* Общие UI элементы */}
      {/* <AppHeader /> */}
      <Navigation />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
