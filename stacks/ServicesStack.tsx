// stacks/ServicesStack.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import ServicesScreen from '@/app/(main)/services/index';
import QRCodeFormScreen from '@/app/(main)/services/qrcodes/form';
import QRCodesScreen from '@/app/(main)/services/qrcodes/index';
import TrackingServiceScreen from '@/app/(main)/services/tracking';

const Stack = createNativeStackNavigator();

/**
 * @deprecated Legacy stack kept for compatibility while migrating to expo-router routes.
 */
export default function ServicesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="ServicesMain"
        component={ServicesScreen}
        options={{ title: 'Сервисы' }}
      />
      <Stack.Screen
        name="QrCodes"
        component={QRCodesScreen}
        options={{ title: 'QR Коды' }}
      />
      <Stack.Screen
        name="QRCodeForm"
        component={QRCodeFormScreen}
        options={{ title: 'Форма QR Кода' }}
      />
      <Stack.Screen
        name="Tracking"
        component={TrackingServiceScreen}
        options={{ title: 'Геомаршруты' }}
      />
    </Stack.Navigator>
  );
}
