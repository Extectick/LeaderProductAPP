import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AuthScreen" />
      <Stack.Screen name="ProfileSelectionScreen" />
    </Stack>
  );
}
