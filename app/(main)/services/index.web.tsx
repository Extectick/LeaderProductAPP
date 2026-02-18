import { useThemeColor } from '@/hooks/useThemeColor';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import ServiceCard from './ServiceCard';
import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import {
  getDesktopServiceCardSize,
  getDesktopServiceColumns,
  getMobileServiceCardSize,
  getMobileServiceColumns,
  getVisibleServices,
} from '@/src/features/services/lib/grid';
import { useServicesData } from '@/src/features/services/hooks/useServicesData';
import { ServicesErrorView, ServicesLoadingView } from '@/src/features/services/ui/ServiceStateViews';

export default function ServicesWebPage() {
  const { services, error, loading } = useServicesData();

  const { width } = useWindowDimensions();
  const router = useRouter();
  const isMobileWidth = width <= 820;
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });

  // более плотная сетка и брейкпоинты для десктопа
  const desktopColumns = useMemo(() => {
    return getDesktopServiceColumns(width);
  }, [width]);

  const gap = 16;
  const desktopCardSize = useMemo(() => {
    return getDesktopServiceCardSize(width, desktopColumns, gap);
  }, [width, desktopColumns]);

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

  if (loading) {
    return <ServicesLoadingView backgroundColor={background} textColor={textColor} style={styles.center} />;
  }

  if (error || !services) {
    return <ServicesErrorView backgroundColor={background} textColor={textColor} message={error} style={styles.center} />;
  }

  if (isMobileWidth) {
    return (
      <View style={{ flex: 1, backgroundColor: background, paddingTop: headerTopInset }}>
        <FlatList
          data={visibleServices}
          keyExtractor={(item) => item.key}
          numColumns={mobileColumns}
          columnWrapperStyle={{ gap: mobileGap, marginBottom: mobileGap }}
          contentContainerStyle={{ padding: mobileGap, paddingTop: 0 }}
          ListFooterComponent={<TabBarSpacer />}
          renderItem={({ item }) => (
            <ServiceCard
              icon={item.icon || 'apps-outline'}
              name={item.name}
              description={item.description || undefined}
              size={mobileCardSize}
              onPress={() => {
                if (!item.route || !item.enabled) return;
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
    <ScrollView
      style={{ flex: 1, backgroundColor: background }}
      contentContainerStyle={[styles.page, { maxWidth: 1320, paddingTop: 24 + headerTopInset }]}
    >
      <View style={[styles.grid, { gap }]}>
        {visibleServices.map((s) => (
          <View key={s.key} style={{ width: desktopCardSize }}>
            <ServiceCard
              icon={s.icon || 'apps-outline'}
              name={s.name}
              description={s.description || undefined}
              size={desktopCardSize}
              onPress={() => {
                if (!s.route || !s.enabled) return;
                router.push(s.route as any);
              }}
              gradient={
                s.gradientStart && s.gradientEnd
                  ? ([s.gradientStart, s.gradientEnd] as [string, string])
                  : undefined
              }
              iconSize={44}
              containerStyle={{ backgroundColor: cardBackground }}
              disabled={!s.enabled}
            />
          </View>
        ))}
      </View>
      <TabBarSpacer />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
