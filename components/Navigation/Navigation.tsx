import { Slot } from 'expo-router';
import { Platform, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import MobileTabs from './MobileTabs';
import WebSidebar from './WebSidebar';

export default function Navigation() {
  const isWeb = Platform.OS === 'web';
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const useMobileLayout = !isWeb || width <= 820;
  const currentPath = pathname && pathname.trim().length > 0 ? pathname : '/home';
  const lastPathRef = React.useRef<string>('/home');
  const lastLayoutRef = React.useRef<boolean>(useMobileLayout);
  const currentPathRef = React.useRef<string>(currentPath);
  const restoreTimersRef = React.useRef<Array<ReturnType<typeof setTimeout>>>([]);

  currentPathRef.current = currentPath;

  const clearRestoreTimers = React.useCallback(() => {
    restoreTimersRef.current.forEach((timer) => clearTimeout(timer));
    restoreTimersRef.current = [];
  }, []);

  React.useEffect(() => {
    if (lastLayoutRef.current === useMobileLayout) return;
    lastLayoutRef.current = useMobileLayout;
    clearRestoreTimers();
    const restorePath = lastPathRef.current || '/home';
    const tryRestore = () => {
      if (currentPathRef.current === restorePath) return;
      router.replace(restorePath as any);
    };

    tryRestore();
    restoreTimersRef.current.push(setTimeout(tryRestore, 40));
    restoreTimersRef.current.push(setTimeout(tryRestore, 160));
    restoreTimersRef.current.push(setTimeout(tryRestore, 340));
  }, [clearRestoreTimers, router, useMobileLayout]);

  React.useEffect(() => {
    lastPathRef.current = currentPath;
  }, [currentPath]);

  React.useEffect(() => {
    return () => {
      clearRestoreTimers();
    };
  }, [clearRestoreTimers]);

  if (useMobileLayout) {
    return <MobileTabs />;
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <WebSidebar />
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  );
}
