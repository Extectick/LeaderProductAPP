import { Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { useProfile } from '../context/ProfileContext';
import { ThemeProvider } from '../context/ThemeContext';

function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}

function RootLayoutContent() {
  const { profile, loading } = useProfile();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#5a67d8" />
      </View>
    );
  }

  const initialRoute = !profile 
    ? 'AuthScreen' 
    : !profile.clientProfile && !profile.supplierProfile && !profile.employeeProfile
      ? 'ProfileSelectionScreen'
      : 'tabs/index';

  return (
    <>
      <Stack
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="AuthScreen" />
        <Stack.Screen name="ProfileSelectionScreen" />
        <Stack.Screen name="tabs/index" />
      </Stack>
      <ThemeSwitcher />
    </>
  );
}

export default RootLayout;
