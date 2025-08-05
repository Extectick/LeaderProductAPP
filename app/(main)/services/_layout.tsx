import { Stack } from 'expo-router';

export default function ServicesLayout() {
  return (
    <Stack>
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Сервисы',
          headerShown: false 
        }} 
      />
      <Stack.Screen
        name="documents/index"
        options={{
          title: 'Документы',
        }}
      />
    </Stack>
  );
}
