import tabScreens from '@/constants/tabScreens';
import { usePathname } from 'expo-router';
import React from 'react';
import { Platform, View } from 'react-native';
import MobileTabs from './MobileTabs';
import WebSidebar from './WebSidebar';

export default function Navigation() {
  const isWeb = Platform.OS === 'web';
  const pathname = usePathname();

  // Найдем экран по текущему пути
  const screen = tabScreens.find(screen => screen.sidebar.path === pathname);
  // Если нет подходящего экрана, показываем пустой View
  const Component = screen ? screen.component : View;
  
  if (isWeb) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <WebSidebar />
        <View style={{ flex: 1 }}>
          <Component />
        </View>
      </View>
    );
  }
  return <MobileTabs />;
}
