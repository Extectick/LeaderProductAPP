import { Tabs } from 'expo-router';
import React from 'react';

export default function MobileTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
      tabBar={() => null}
    >
      <Tabs.Screen name="home/index" options={{ title: "Главная" }} />
      <Tabs.Screen name="tasks/index" options={{ title: "Задачи" }} />
      <Tabs.Screen name="services" options={{ title: "Сервисы" }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль" }} />
      <Tabs.Screen name="admin" options={{ title: "Админ" }} />
    </Tabs>
  );
}
