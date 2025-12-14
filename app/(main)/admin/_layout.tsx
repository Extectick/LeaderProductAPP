import React from 'react';
import { Stack } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        header: () => (
          <AppHeader title="Администрирование" icon="shield-checkmark-outline" showBack={false} />
        ),
        animation: 'ios_from_left',
      }}
    />
  );
}
