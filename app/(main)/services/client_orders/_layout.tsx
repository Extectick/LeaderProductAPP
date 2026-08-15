import { Stack } from 'expo-router';

export default function ClientOrdersLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="counterparty" options={{ animation: 'none', gestureEnabled: true }} />
    </Stack>
  );
}
