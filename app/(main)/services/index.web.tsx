import { useThemeColor } from '@/hooks/useThemeColor';
import { getServicesForUser, type ServiceAccessItem } from '@/utils/servicesService';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import ServiceCard from './ServiceCard';
import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';

export default function ServicesWebPage() {
  const [services, setServices] = useState<ServiceAccessItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { width } = useWindowDimensions();
  const router = useRouter();
  const isMobileWidth = width <= 820;
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });

  // более плотная сетка и брейкпоинты для десктопа
  const desktopColumns = useMemo(() => {
    if (width < 640) return 2;
    if (width < 960) return 3;
    if (width < 1280) return 4;
    if (width < 1600) return 5;
    return 6;
  }, [width]);

  const gap = 16;
  const desktopCardSize = useMemo(() => {
    const inner = Math.min(1280, width) - gap * 2 - (desktopColumns - 1) * gap;
    return Math.max(140, Math.floor(inner / desktopColumns));
  }, [width, desktopColumns]);

  // мобильный/узкий layout
  const mobileColumns = useMemo(() => {
    if (width < 360) return 2;
    if (width < 768) return 2;
    return 3;
  }, [width]);
  const mobileGap = 14;
  const mobileCardSize = useMemo(() => {
    const inner = width - mobileGap * 2 - (mobileColumns - 1) * mobileGap;
    return Math.min(200, Math.max(120, Math.floor(inner / mobileColumns)));
  }, [width, mobileColumns]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getServicesForUser();
        setServices(data);
      } catch (e: any) {
        setError(e?.message || 'Не удалось загрузить сервисы');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: background }]}>
        <ActivityIndicator size="large" color={textColor} />
      </View>
    );
  }

  if (error || !services) {
    return (
      <View style={[styles.center, { backgroundColor: background }]}>
        <Text style={{ color: textColor }}>{error ?? 'Ошибка'}</Text>
      </View>
    );
  }

  if (isMobileWidth) {
    return (
      <View style={{ flex: 1, backgroundColor: background, paddingTop: headerTopInset }}>
        <FlatList
          data={services.filter((item) => item.visible)}
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
        {services.filter((item) => item.visible).map((s) => (
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
