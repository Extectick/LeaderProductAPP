import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Можно явно указать экран по умолчанию */}
      {/* <Stack.Screen name="AuthScreen" /> */}
    </Stack>
  );
}
