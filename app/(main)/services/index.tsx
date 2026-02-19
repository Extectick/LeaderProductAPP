import { useThemeColor } from '@/hooks/useThemeColor';
import { useNotify } from '@/components/NotificationHost';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import ServiceCard from './ServiceCard';
import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { getMobileServiceCardSize, getMobileServiceColumns, getVisibleServices } from '@/src/features/services/lib/grid';
import { useServicesData } from '@/src/features/services/hooks/useServicesData';
import { ServicesErrorView, ServicesLoadingView } from '@/src/features/services/ui/ServiceStateViews';

export default function ServicesScreen() {
  const { services, error, loading } = useServicesData();

  const router = useRouter();
  const notify = useNotify();
  const { isReachable } = useServerStatus();
  const { width } = useWindowDimensions();
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });

  // брейкпоинты под мобильные/планшеты
  const numColumns = useMemo(() => {
    return getMobileServiceColumns(width);
  }, [width]);

  const spacing = 14;
  const cardSize = useMemo(() => {
    return getMobileServiceCardSize(width, numColumns, spacing);
  }, [width, numColumns]);

  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const visibleServices = useMemo(() => getVisibleServices(services), [services]);

  if (loading && !services?.length) {
    return <ServicesLoadingView backgroundColor={background} textColor={textColor} style={styles.centered} />;
  }

  if (error || !services?.length) {
    return <ServicesErrorView backgroundColor={background} textColor={textColor} message={error} style={styles.centered} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <FlatList
        key={`services-grid-${numColumns}`}
        data={visibleServices}
        keyExtractor={(item) => item.key}
        numColumns={numColumns}
        columnWrapperStyle={{ gap: spacing, marginBottom: spacing }}
        contentContainerStyle={{ padding: spacing, paddingTop: headerTopInset + spacing }}
        ListFooterComponent={<TabBarSpacer />}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View>
            <ServiceCard
              icon={item.icon || 'apps-outline'}
              name={item.name}
              description={item.description || undefined}
              kind={item.kind}
              size={cardSize}
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
              disableShadow={false}
              disableScaleOnPress={false}
              disabled={!item.enabled}
              containerStyle={{
                backgroundColor: cardBackground,
              }}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...Platform.select({
      web: { maxWidth: 1200, marginHorizontal: 'auto', paddingHorizontal: 24 },
      default: {},
    }),
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
