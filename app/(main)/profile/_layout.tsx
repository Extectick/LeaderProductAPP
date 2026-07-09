import { AppHeader } from "@/components/AppHeader";
import { Stack, usePathname, useRouter } from "expo-router";
import React from "react";
import { BackHandler, Platform } from "react-native";

export default function ProfileLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isNative = Platform.OS !== "web";

  const goToServices = React.useCallback(() => {
    router.replace("/services" as any);
  }, [router]);

  React.useEffect(() => {
    if (!isNative) return;
    const cleanPath = String(pathname || "").split("?")[0].replace(/\/+$/, "") || "/";
    if (cleanPath !== "/profile") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goToServices();
      return true;
    });
    return () => subscription.remove();
  }, [goToServices, isNative, pathname]);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: "transparent" },
        header: () => (
          <AppHeader
            title="Профиль"
            icon="person-outline"
            showBack={isNative}
            onBack={isNative ? goToServices : undefined}
          />
        ),
        animation: "ios_from_left",
      }}
    />
  );
}
