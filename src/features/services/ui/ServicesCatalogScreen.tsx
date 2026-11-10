import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useNotificationViewport } from '@/context/NotificationViewportContext';
import { ScreenBlurTarget } from '@/components/ui/AppScreenBlur';
import { useAppSurfaceTheme } from '@/components/ui/appSurfaceTokens';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { saveWebCachedLastServiceRoute } from '@/src/features/navigation/lastServiceRouteStorage';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ServiceRow from './ServiceRow';
import { useServicesData } from '../hooks/useServicesData';
import { applyAdminCatalogService } from '../lib/adminCatalogService';
import { getVisibleServices } from '../lib/grid';
import { canOpenService, supportsServiceRoute } from '../lib/serviceAvailability';
import { ServicesEmptyView, ServicesErrorView, ServicesLoadingView } from './ServiceStateViews';
import { servicesTokens } from './servicesTokens';
import {APP_TOOLBAR_LAYOUT as toolbar} from '@/components/ui/appToolbarLayout';
import {APP_LAYOUT} from '@/src/shared/layout/appLayout';

/** The same rows reflow on desktop; their content and service permissions stay shared. */
export default function ServicesCatalogScreen() {
  const { services, error, loading, loadServices } = useServicesData();
  const { isAdmin, isCheckingAdmin } = useIsAdmin();
  const { isReachable } = useServerStatus();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(width);
  const { headerBottomOffset } = useNotificationViewport();
  const insets = useSafeAreaInsets();
  const headerTopInset = headerBottomOffset || (Platform.OS === 'web' ? 0 : insets.top) + toolbar.top + toolbar.actionSize + toolbar.bottom;
  const {background,text:textColor} = useAppSurfaceTheme();
  const columns = Platform.OS === 'web' && containerWidth >= 900 ? 2 : 1;
  const contentWidth = Platform.OS === 'web' ? Math.min(containerWidth, APP_LAYOUT.catalogMaxWidth) : containerWidth;
  const rowWidth = Math.max(0, contentWidth / columns);
  const catalogServices = useMemo(() => applyAdminCatalogService(services, !isCheckingAdmin && isAdmin), [services, isAdmin, isCheckingAdmin]);
  const visibleServices = useMemo(() => getVisibleServices(catalogServices).filter(item => Platform.OS === 'web' || item.key !== 'tasks').sort((a,b)=>Number(b.key==='help')-Number(a.key==='help')), [catalogServices]);

  useFocusEffect(React.useCallback(() => { void loadServices(true); }, [loadServices]));

  const openService = React.useCallback((item: (typeof visibleServices)[number]) => {
    if (!canOpenService(item, isReachable, Platform.OS)) return;
    saveWebCachedLastServiceRoute(item.route);
    router.push(item.route as any);
  }, [isReachable, router]);

  const renderService = (item: (typeof visibleServices)[number]) => <ServiceRow
    icon={item.icon || 'apps-outline'}
    name={item.name}
    description={supportsServiceRoute(item) ? item.description || undefined : 'Доступно в новой версии приложения'}
    kind={item.kind}
    size={rowWidth}
    onPress={() => openService(item)}
    gradient={item.gradientStart && item.gradientEnd ? [item.gradientStart, item.gradientEnd] : undefined}
    iconSize={36}
    disabled={!item.enabled || !supportsServiceRoute(item)}
  />;

  return <ScreenBlurTarget testID="services-catalog" style={[styles.container, { backgroundColor: background }]} onLayout={event => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0) setContainerWidth(previous => previous === next ? previous : next);
  }}>
    {loading && !visibleServices.length ? <ServicesLoadingView backgroundColor={background} textColor={textColor} columns={columns} cardSize={Math.min(rowWidth, servicesTokens.row.maxContentWidth)} gap={0} horizontalPadding={0} topPadding={headerTopInset + 4}/> :
      error && !visibleServices.length ? <ServicesErrorView backgroundColor={background} textColor={textColor} message={error}/> :
      Platform.OS === 'web' ? <ScrollView testID="services-list" style={styles.list} contentContainerStyle={[styles.content,{paddingTop:headerTopInset+4,alignItems:'center'}]}>
        <View testID="services-responsive-grid" style={{width:'100%',maxWidth:APP_LAYOUT.catalogMaxWidth,flexDirection:'row',flexWrap:'wrap'}}>
          {visibleServices.map(item=><View key={item.key} testID={`services-cell-${item.key}`} style={{width:columns===2?'50%':'100%',minWidth:0}}>{renderService(item)}</View>)}
          {!visibleServices.length?<ServicesEmptyView textColor={textColor}/>:null}
        </View>
        <TabBarSpacer/>
      </ScrollView> :
      <FlatList
        testID="services-list"
        data={visibleServices}
        keyExtractor={item => item.key}
        style={styles.list}
        contentContainerStyle={[styles.content, { paddingTop: headerTopInset + 4 }]}
        ListEmptyComponent={<ServicesEmptyView textColor={textColor}/>}
        ListFooterComponent={<TabBarSpacer/>}
        renderItem={({ item }) => renderService(item)}
        showsVerticalScrollIndicator={false}
      />}
  </ScreenBlurTarget>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1, width: '100%' },
  content: { width: '100%', paddingBottom: 16 },
});
