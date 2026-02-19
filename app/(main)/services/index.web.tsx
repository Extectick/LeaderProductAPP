import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { useNotify } from '@/components/NotificationHost';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useServicesData } from '@/src/features/services/hooks/useServicesData';
import { getServiceGridMetrics, getVisibleServices } from '@/src/features/services/lib/grid';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { ServicesErrorView, ServicesLoadingView } from '@/src/features/services/ui/ServiceStateViews';
import { servicesTokens } from '@/src/features/services/ui/servicesTokens';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import ServiceCard from './ServiceCard';

export default function ServicesWebPage() {
  const { services, error, loading } = useServicesData();
  const { width } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = React.useState(width);
  const router = useRouter();
  const notify = useNotify();
  const { isReachable } = useServerStatus();
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });
  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');

  const isMobileWidth = width <= 820;
  const metrics = useMemo(
    () =>
      getServiceGridMetrics({
        width: isMobileWidth ? width : containerWidth,
        platform: 'web',
        isMobileLayout: isMobileWidth,
      }),
    [containerWidth, isMobileWidth, width]
  );
  const visibleServices = useMemo(() => getVisibleServices(services), [services]);

  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    const next = Math.max(0, Math.round(event.nativeEvent.layout.width || 0));
    if (!next) return;
    setContainerWidth((prev) => (prev === next ? prev : next));
  }, []);

  const openService = React.useCallback((item: (typeof visibleServices)[number]) => {
    if (!item.route || !item.enabled) return;
    if (item.kind === 'CLOUD' && !isReachable) {
      notify({
        type: 'warning',
        title: 'Нет связи с сервером',
        message: 'Для открытия облачного сервиса нужна связь с сервером.',
        icon: 'cloud-offline-outline',
        durationMs: 5000,
      });
      return;
    }
    router.push(item.route as any);
  }, [isReachable, notify, router]);

  if (loading && !services?.length) {
    return <ServicesLoadingView backgroundColor={background} textColor={textColor} style={styles.center} />;
  }

  if (error || !services?.length) {
    return <ServicesErrorView backgroundColor={background} textColor={textColor} message={error} style={styles.center} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]} onLayout={handleLayout}>
      <FlatList
        key={`services-web-grid-${isMobileWidth ? 'm' : 'd'}-${metrics.columns}`}
        style={styles.list}
        data={visibleServices}
        keyExtractor={(item) => item.key}
        numColumns={metrics.columns}
        columnWrapperStyle={
          metrics.columns > 1
            ? {
                gap: metrics.gap,
                justifyContent: 'center',
              }
            : undefined
        }
        contentContainerStyle={[
          styles.content,
          {
            maxWidth: isMobileWidth ? undefined : metrics.maxContentWidth,
            paddingTop: headerTopInset + servicesTokens.page.topPadding,
            paddingHorizontal: metrics.horizontalPadding,
            rowGap: metrics.gap,
          },
        ]}
        ListFooterComponent={<TabBarSpacer />}
        renderItem={({ item, index }) => (
          <View style={{ width: metrics.cardSize }}>
            <ServiceCard
              icon={item.icon || 'apps-outline'}
              name={item.name}
              description={item.description || undefined}
              kind={item.kind}
              size={metrics.cardSize}
              enterIndex={index}
              onPress={() => openService(item)}
              gradient={
                item.gradientStart && item.gradientEnd
                  ? ([item.gradientStart, item.gradientEnd] as [string, string])
                  : undefined
              }
              iconSize={isMobileWidth ? 40 : 44}
              disabled={!item.enabled}
              containerStyle={{ backgroundColor: cardBackground }}
            />
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: servicesTokens.page.shellBackground,
  },
  list: {
    flex: 1,
    width: '100%',
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    paddingBottom: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
