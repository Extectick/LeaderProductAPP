import React from 'react';
import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: 'Администрирование',
        animation: 'ios_from_left',
      }}
    />
  );
}
