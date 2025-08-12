// stacks/ServicesStack.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import ServicesScreen from '@/app/(main)/services/index';
import QRCodeFormScreen from '@/app/(main)/services/qrcodes/form';
import QRCodesScreen from '@/app/(main)/services/qrcodes/index';

const Stack = createNativeStackNavigator();

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
    </Stack.Navigator>
  );
}
