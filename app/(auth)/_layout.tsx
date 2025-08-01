import { Stack } from 'expo-router';

export default function AuthLayout() {
  console.log('Auth Screen')
  return (
    
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AuthScreen" />
      <Stack.Screen name="ProfileSelectionScreen" />
    </Stack>
  );
}
