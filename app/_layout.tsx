import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useProfile } from '../context/ProfileContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ensureAuth } from '../utils/auth';

function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootLayoutContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutContent() {
  const { profile, loading, fetchProfile } = useProfile();
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    console.log('Layout auth check started');
    
    const checkAuth = async () => {
      try {
        console.log('Checking auth...');
        const token = await ensureAuth();
        console.log('Auth token:', token);
        
        if (!isMounted) return;
        
        if (!token) {
          console.log('No token, staying on AuthScreen');
          setIsAuthChecked(true);
          return;
        }
        
        if (!profile) {
          console.log('Fetching profile...');
          await fetchProfile(token);
        }
      } catch (e) {
        console.error('Auth check error:', e);
        if (isMounted) {
          setIsAuthChecked(true);
        }
      }
    };

    checkAuth();
    
    return () => {
      console.log('Layout unmounted');
      isMounted = false;
    };
  }, [profile]);

  if (loading || !isAuthChecked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#5a67d8" />
      </View>
    );
  }

  const initialRoute = !isAuthChecked
    ? undefined
    : !profile || !profile.id
      ? 'AuthScreen'
      : !profile.clientProfile && !profile.supplierProfile && !profile.employeeProfile
        ? 'ProfileSelectionScreen'
        : 'MainApp';

  return (
    <>
      <Stack initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AuthScreen" />
        <Stack.Screen name="ProfileSelectionScreen" />
        <Stack.Screen name="tabs/index" />
      </Stack>
    </>
  );
}

export default RootLayout;
