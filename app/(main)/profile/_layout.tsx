import { Stack } from "expo-router";
import { AppHeader } from "@/components/AppHeader";

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        headerShadowVisible: false,
        headerStatusBarHeight: 0,
        headerStyle: { backgroundColor: 'transparent' },
        header: () => (
          <AppHeader title="Профиль" icon="person-outline" showBack={false} />
        ),
        animation: 'ios_from_left'
      }}
    />
  );
}
