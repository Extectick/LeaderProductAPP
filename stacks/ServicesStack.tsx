// stacks/ServicesStack.tsx
import ServicesScreen from '@/app/(main)/services/index';
import QRcodes from '@/app/(main)/services/qrcodes/index';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

const Stack = createNativeStackNavigator();

export default function ServicesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ServicesMain" component={ServicesScreen} />
      <Stack.Screen name="QrCodes" component={QRcodes} />
    </Stack.Navigator>
  );
}
