import { useThemeColor } from '@/hooks/useThemeColor';
import { getServicesForUser, type ServiceAccessItem } from '@/utils/servicesService';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import ServiceCard from './ServiceCard';
import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';

export default function ServicesScreen() {
  const [services, setServices] = useState<ServiceAccessItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const { width } = useWindowDimensions();
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });

  // брейкпоинты под мобильные/планшеты
  const numColumns = useMemo(() => {
    if (width < 360) return 2;       // маленькие телефоны
    if (width < 768) return 2;       // телефоны
    return 3;                        // планшеты
  }, [width]);

  const spacing = 14;
  const cardSize = useMemo(() => {
    // обеспечим фиксированный отступ между плитками
    const innerWidth = width - spacing * 2 - (numColumns - 1) * spacing;
    const side = Math.floor(innerWidth / numColumns);
    // ограничим «чтобы дышало»
    return Math.min(200, Math.max(120, side));
  }, [width, numColumns]);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const data = await getServicesForUser();
        setServices(data);
      } catch (e: any) {
        setError(e?.message || 'Не удалось загрузить сервисы');
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, []);

  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: background }]}>
        <ActivityIndicator size="large" color={textColor} />
      </View>
    );
  }

  if (error || !services) {
    return (
      <View style={[styles.centered, { backgroundColor: background }]}>
        <Text style={{ color: textColor, fontSize: 16 }}>{error ?? 'Ошибка'}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <FlatList
        data={services.filter((item) => item.visible)}
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
              size={cardSize}
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
