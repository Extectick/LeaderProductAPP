import QRCodesScreen from '@/app/(main)/services/qrcodes';
import QRCodeFormScreen from '@/app/(main)/services/qrcodes/form';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

export type QRCodesStackParamList = {
  QRCodesList: undefined;
  QRCodeForm: { id?: string };
};

const Stack = createNativeStackNavigator<QRCodesStackParamList>();

/**
 * @deprecated Legacy stack kept for compatibility while migrating to expo-router routes.
 */
export default function QRCodesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="QRCodesList" component={QRCodesScreen} />
      <Stack.Screen name="QRCodeForm" component={QRCodeFormScreen} />
    </Stack.Navigator>
  );
}
