import { services as staticServices } from '@/constants/servicesRoutes';
import { useThemeColor } from '@/hooks/useThemeColor';
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

export default function ServicesScreen() {
  const [services, setServices] = useState<typeof staticServices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const { width } = useWindowDimensions();

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
        await new Promise((res) => setTimeout(res, 600));
        setServices(staticServices);
      } catch {
        setError('Не удалось загрузить сервисы');
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
      <Text style={[styles.title, { color: textColor }]}>Сервисы</Text>

      <FlatList
        data={services}
        keyExtractor={(item) => item.name}
        numColumns={numColumns}
        columnWrapperStyle={{ gap: spacing, marginBottom: spacing }}
        contentContainerStyle={{ padding: spacing, paddingTop: 0 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View>
            <ServiceCard
              icon={item.icon}
              name={item.name}
              description={item.description}
              size={cardSize}
              onPress={() => {
                router.push(item.route as any);
              }}
              gradient={item.gradient}
              iconSize={40}
              disableShadow={false}
              disableScaleOnPress={false}
              disabled={item.disable}
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
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
});
