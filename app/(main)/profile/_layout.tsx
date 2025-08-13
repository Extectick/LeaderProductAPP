import { Stack } from "expo-router";

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: 'Профиль',
        animation: 'ios_from_left'
      }}
    />
  );
}
