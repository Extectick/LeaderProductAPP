import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';
import FloatingTabBar, {
} from './FloatingTabBar';
import { bottomTabItems } from './bottomTabsConfig';

export default function MobileTabs() {
  const { isAdmin } = useIsAdmin();
  const visibleItems = useMemo(
    () => bottomTabItems.filter((item) => !item.requiresAdmin || isAdmin),
    [isAdmin]
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <FloatingTabBar {...props} items={visibleItems} />}
    >
      <Tabs.Screen name="home/index" options={{ title: "Главная" }} />
      <Tabs.Screen name="tasks/index" options={{ title: "Задачи" }} />
      <Tabs.Screen name="services" options={{ title: "Сервисы" }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль" }} />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Админ",
          // полностью убираем таб и маршрут из навигатора, если нет прав
          href: isAdmin ? undefined : null,
        }}
      />
    </Tabs>
  );
}
