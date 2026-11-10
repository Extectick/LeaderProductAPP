import { Slot } from 'expo-router';
import { Platform, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import WebSidebar from './WebSidebar';
import {appLayoutMode} from '@/src/shared/layout/appLayout';
import { TabBarVisibilityProvider } from './TabBarVisibilityContext';
import {
  LastServiceRouteProvider,
  useOptionalLastServiceRoute,
} from '@/src/features/navigation/LastServiceRouteContext';
import { UnsavedChangesProvider } from '@/src/features/navigation/UnsavedChangesContext';

const NATIVE_DEFAULT_ROUTE = '/services';

const normalizeNavigationPath = (path: string | null | undefined) => {
  const clean = String(path || '')
    .split('?')[0]
    .split('#')[0]
    .trim()
    .replace(/\/\([^/]+\)/g, '')
    .replace(/\/+/g, '/');
  return clean.length > 1 && clean.endsWith('/') ? clean.slice(0, -1) : clean;
};

const isNativeHiddenRootRoute = (path: string) => path === '/home' || path === '/tasks';

function ServicesRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const lastService = useOptionalLastServiceRoute();
  const previousPathRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const previousPath = normalizeNavigationPath(previousPathRef.current);
    const currentPath = normalizeNavigationPath(pathname);
    previousPathRef.current = currentPath || null;
    if (!lastService) return;

    if (currentPath === '/services' && (previousPath.startsWith('/services/') || previousPath === '/admin' || previousPath.startsWith('/admin/'))) {
      lastService.clearLastServiceRoute();
      return;
    }

    if (currentPath !== '/services') return;
    if (previousPath.startsWith('/services')) return;
    // On the web /services is Home, not a tab that resumes its last child.
    // Keep native cold-start restoration without redirecting explicit Home clicks.
    if (Platform.OS === 'web') return;

    const shouldRestoreLastService =
      !previousPath || previousPath === '/' || isNativeHiddenRootRoute(previousPath);
    if (!shouldRestoreLastService) return;

    if (lastService.lastServiceRoute) {
      router.replace(lastService.lastServiceRoute as any);
      return;
    }
    void lastService.resolveLastServiceRoute().then((route) => {
      if (route) router.replace(route as any);
    });
  }, [lastService, pathname, router]);

  return null;
}

export default function Navigation() {
  const isWeb = Platform.OS === 'web';
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const useNativeLayout = !isWeb;
  const layout = appLayoutMode(width);
  const defaultMainRoute = NATIVE_DEFAULT_ROUTE;
  const currentPath = pathname && pathname.trim().length > 0 ? pathname : defaultMainRoute;

  React.useEffect(() => {
    if (!useNativeLayout) return;
    const cleanPath = normalizeNavigationPath(currentPath);
    if (!isNativeHiddenRootRoute(cleanPath)) return;
    router.replace(NATIVE_DEFAULT_ROUTE as any);
  }, [currentPath, router, useNativeLayout]);

  return (
    <LastServiceRouteProvider>
      <UnsavedChangesProvider>
        <TabBarVisibilityProvider>
          <ServicesRouteGuard />
          {/* The router outlet and providers keep their identity across resize. */}
          <View testID="app-responsive-shell" style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}>
            <View key="sidebar" style={{display:isWeb&&layout!=='compact'?'flex':'none'}}>
              {isWeb ? <WebSidebar compact={layout!=='wide'} visible={layout!=='compact'}/> : null}
            </View>
            <View key="content" testID="app-route-content" style={{ flex: 1, minWidth: 0 }}>
              <Slot />
            </View>
          </View>
        </TabBarVisibilityProvider>
      </UnsavedChangesProvider>
    </LastServiceRouteProvider>
  );
}
