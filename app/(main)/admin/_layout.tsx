import React from 'react';
import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTransparent: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: 'transparent' },
        animation: 'ios_from_left',
      }}
    />
  );
}
