import { useThemeColor } from '@/hooks/useThemeColor';
import { useNotify } from '@/components/NotificationHost';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import ServiceCard from './ServiceCard';
import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import {
  getMobileServiceCardSize,
  getMobileServiceColumns,
  getVisibleServices,
} from '@/src/features/services/lib/grid';
import { useServicesData } from '@/src/features/services/hooks/useServicesData';
import { ServicesErrorView, ServicesLoadingView } from '@/src/features/services/ui/ServiceStateViews';

function getDesktopGridMetrics(containerWidth: number) {
  const safeWidth = Math.max(360, Math.floor(containerWidth || 0));
  const horizontalPadding =
    safeWidth < 520 ? 12 :
    safeWidth < 900 ? 16 :
    safeWidth < 1320 ? 20 : 24;
  const gap = safeWidth < 720 ? 12 : safeWidth < 1200 ? 14 : 16;
  const innerWidth = Math.max(0, safeWidth - horizontalPadding * 2);
  const preferredCardWidth =
    safeWidth < 900 ? 250 :
    safeWidth < 1320 ? 260 : 270;
  const maxColumns =
    safeWidth < 560 ? 1 :
    safeWidth < 860 ? 2 :
    safeWidth < 1160 ? 3 :
    safeWidth < 1460 ? 4 :
    safeWidth < 1760 ? 5 : 6;

  let columns = Math.round((innerWidth + gap) / (preferredCardWidth + gap));
  if (!Number.isFinite(columns) || columns < 1) columns = 1;
  columns = Math.min(maxColumns, Math.max(1, columns));

  const rawCardSize = Math.floor((innerWidth - gap * (columns - 1)) / columns);
  const cardSize = Math.min(280, Math.max(170, rawCardSize));

  return { columns, gap, horizontalPadding, cardSize };
}

export default function ServicesWebPage() {
  const { services, error, loading } = useServicesData();

  const { width } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = React.useState(width);
  const router = useRouter();
  const notify = useNotify();
  const { isReachable } = useServerStatus();
  const isMobileWidth = width <= 820;
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });

  const desktopMetrics = useMemo(() => {
    return getDesktopGridMetrics(containerWidth);
  }, [containerWidth]);

  // мобильный/узкий layout
  const mobileColumns = useMemo(() => {
    return getMobileServiceColumns(width);
  }, [width]);
  const mobileGap = 14;
  const mobileCardSize = useMemo(() => {
    return getMobileServiceCardSize(width, mobileColumns, mobileGap);
  }, [width, mobileColumns]);

  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const visibleServices = useMemo(() => getVisibleServices(services), [services]);
  const handleContainerLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.max(0, Math.round(event.nativeEvent.layout.width || 0));
    if (!nextWidth) return;
    setContainerWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);

  if (loading && !services?.length) {
    return <ServicesLoadingView backgroundColor={background} textColor={textColor} style={styles.center} />;
  }

  if (error || !services?.length) {
    return <ServicesErrorView backgroundColor={background} textColor={textColor} message={error} style={styles.center} />;
  }

  if (isMobileWidth) {
    return (
      <View style={{ flex: 1, backgroundColor: background, paddingTop: headerTopInset }}>
        <FlatList
          key={`services-grid-mobile-${mobileColumns}`}
          data={visibleServices}
          keyExtractor={(item) => item.key}
          numColumns={mobileColumns}
          columnWrapperStyle={{ gap: mobileGap, marginBottom: mobileGap, justifyContent: 'center' }}
          contentContainerStyle={{ padding: mobileGap, paddingTop: 0, alignItems: 'center' }}
          ListFooterComponent={<TabBarSpacer />}
          renderItem={({ item }) => (
            <ServiceCard
              icon={item.icon || 'apps-outline'}
              name={item.name}
              description={item.description || undefined}
              kind={item.kind}
              size={mobileCardSize}
              onPress={() => {
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
              }}
              gradient={
                item.gradientStart && item.gradientEnd
                  ? ([item.gradientStart, item.gradientEnd] as [string, string])
                  : undefined
              }
              iconSize={40}
              containerStyle={{ backgroundColor: cardBackground }}
              disabled={!item.enabled}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: background }} onLayout={handleContainerLayout}>
      <FlatList
        key={`services-grid-web-${desktopMetrics.columns}`}
        style={styles.desktopList}
        data={visibleServices}
        keyExtractor={(item) => item.key}
        numColumns={desktopMetrics.columns}
        columnWrapperStyle={
          desktopMetrics.columns > 1
            ? {
                gap: desktopMetrics.gap,
                marginBottom: desktopMetrics.gap,
                justifyContent: 'center',
              }
            : undefined
        }
        contentContainerStyle={[
          styles.desktopScrollContent,
          {
            paddingTop: headerTopInset + 24,
            paddingHorizontal: desktopMetrics.horizontalPadding,
            rowGap: desktopMetrics.columns === 1 ? desktopMetrics.gap : 0,
            alignItems: 'center',
          },
        ]}
        ListFooterComponent={<TabBarSpacer />}
        renderItem={({ item }) => (
          <View style={{ width: desktopMetrics.cardSize }}>
            <ServiceCard
              icon={item.icon || 'apps-outline'}
              name={item.name}
              description={item.description || undefined}
              kind={item.kind}
              size={desktopMetrics.cardSize}
              onPress={() => {
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
              }}
              gradient={
                item.gradientStart && item.gradientEnd
                  ? ([item.gradientStart, item.gradientEnd] as [string, string])
                  : undefined
              }
              iconSize={44}
              containerStyle={{ backgroundColor: cardBackground }}
              disabled={!item.enabled}
            />
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  desktopList: {
    flex: 1,
    width: '100%',
  },
  desktopScrollContent: {
    width: '100%',
    paddingBottom: 24,
    maxWidth: 1400,
    alignSelf: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
