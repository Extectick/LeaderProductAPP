import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useNotificationViewport } from '@/context/NotificationViewportContext';
import { ScreenBlurTarget } from '@/components/ui/AppScreenBlur';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { saveWebCachedLastServiceRoute } from '@/src/features/navigation/lastServiceRouteStorage';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ServiceRow from './ServiceRow';
import { useServicesData } from '../hooks/useServicesData';
import { applyAdminCatalogService } from '../lib/adminCatalogService';
import { getVisibleServices } from '../lib/grid';
import { canOpenService, supportsServiceRoute } from '../lib/serviceAvailability';
import { ServicesEmptyView, ServicesErrorView, ServicesLoadingView } from './ServiceStateViews';
import { servicesTokens } from './servicesTokens';

/** The catalog keeps the same row geometry on phones, tablets and the web. */
export default function ServicesCatalogScreen() {
  const { services, error, loading, loadServices } = useServicesData();
  const { isAdmin, isCheckingAdmin } = useIsAdmin();
  const { isReachable } = useServerStatus();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(width);
  const { headerBottomOffset } = useNotificationViewport();
  const insets = useSafeAreaInsets();
  const headerTopInset = headerBottomOffset || (Platform.OS === 'web' ? 0 : insets.top) + 48;
  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const rowWidth = Math.max(0, containerWidth);
  const catalogServices = useMemo(() => applyAdminCatalogService(services, !isCheckingAdmin && isAdmin), [services, isAdmin, isCheckingAdmin]);
  const visibleServices = useMemo(() => getVisibleServices(catalogServices).filter(item => Platform.OS === 'web' || item.key !== 'tasks'), [catalogServices]);

  useFocusEffect(React.useCallback(() => { void loadServices(true); }, [loadServices]));

  const openService = React.useCallback((item: (typeof visibleServices)[number]) => {
    if (!canOpenService(item, isReachable, Platform.OS)) return;
    saveWebCachedLastServiceRoute(item.route);
    router.push(item.route as any);
  }, [isReachable, router]);

  return <ScreenBlurTarget testID="services-catalog" style={[styles.container, { backgroundColor: background }]} onLayout={event => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0) setContainerWidth(previous => previous === next ? previous : next);
  }}>
    {loading && !visibleServices.length ? <ServicesLoadingView backgroundColor={background} textColor={textColor} columns={1} cardSize={Math.max(0, Math.min(rowWidth, servicesTokens.row.maxContentWidth) - 40)} gap={0} horizontalPadding={20} topPadding={headerTopInset + 4}/> :
      error && !visibleServices.length ? <ServicesErrorView backgroundColor={background} textColor={textColor} message={error}/> :
      <FlatList
        testID="services-list"
        data={visibleServices}
        keyExtractor={item => item.key}
        style={styles.list}
        contentContainerStyle={[styles.content, { paddingTop: headerTopInset + 4 }]}
        ListEmptyComponent={<ServicesEmptyView textColor={textColor}/>}
        ListFooterComponent={<TabBarSpacer/>}
        renderItem={({ item }) => <ServiceRow
          icon={item.icon || 'apps-outline'}
          name={item.name}
          description={supportsServiceRoute(item) ? item.description || undefined : 'Доступно в новой версии приложения'}
          kind={item.kind}
          size={rowWidth}
          onPress={() => openService(item)}
          gradient={item.gradientStart && item.gradientEnd ? [item.gradientStart, item.gradientEnd] : undefined}
          iconSize={36}
          disabled={!item.enabled || !supportsServiceRoute(item)}
        />}
        showsVerticalScrollIndicator={false}
      />}
  </ScreenBlurTarget>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1, width: '100%' },
  content: { width: '100%', paddingBottom: 16 },
});
