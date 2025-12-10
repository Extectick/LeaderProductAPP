import { useThemeColor } from '@/hooks/useThemeColor';
import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import React from 'react';

export default function MobileTabs() {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const auth = useContext(AuthContext);
  const isAdmin = auth?.profile?.role?.name === 'admin' || auth?.profile?.role?.name === 'administrator';

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            "home/index": "home-outline",
            "tasks/index": "list-outline",
            "services" : "apps",
            "profile" : "person-outline",
            "admin" : "shield-checkmark-outline",
          };
          return (
            <Ionicons name={icons[route.name]} size={size} color={color} />
          );
        },
        tabBarActiveTintColor: textColor,
        tabBarInactiveTintColor: "gray",
        tabBarStyle: {
          backgroundColor,
          borderTopWidth: 0,
          elevation: 0,
        },
      })}
    >
      <Tabs.Screen name="home/index" options={{ title: "Главная" }} />
      <Tabs.Screen name="tasks/index" options={{ title: "Задачи" }} />
      <Tabs.Screen name="services" options={{ title: "Сервисы" }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль" }} />
      {isAdmin && <Tabs.Screen name="admin" options={{ title: "Админ" }} />}
    </Tabs>
  );
}
