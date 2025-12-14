import { services as staticServices } from '@/constants/servicesRoutes';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import ServiceCard from './ServiceCard';

export default function ServicesWebPage() {
  const [services, setServices] = useState<typeof staticServices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { width } = useWindowDimensions();
  const router = useRouter();

  // более плотная сетка и брейкпоинты для десктопа
  const numColumns = useMemo(() => {
    if (width < 640) return 2;
    if (width < 960) return 3;
    if (width < 1280) return 4;
    if (width < 1600) return 5;
    return 6;
  }, [width]);

  const gap = 16;
  const cardSize = useMemo(() => {
    const inner = Math.min(1280, width) - gap * 2 - (numColumns - 1) * gap;
    return Math.max(140, Math.floor(inner / numColumns));
  }, [width, numColumns]);

  useEffect(() => {
    const load = async () => {
      try {
        await new Promise((r) => setTimeout(r, 500));
        setServices(staticServices);
      } catch {
        setError('Не удалось загрузить сервисы');
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: background }}
      contentContainerStyle={[styles.page, { maxWidth: 1320 }]}
    >
      <Text style={[styles.heading, { color: textColor }]}>Сервисы</Text>

      <View style={[styles.grid, { gap }]}>
        {services.map((s, idx) => (
          <View key={s.name} style={{ width: cardSize }}>
            <ServiceCard
              icon={s.icon}
              name={s.name}
              description={s.description}
              size={cardSize}
              onPress={() => router.push(s.route as any)}
              gradient={s.gradient}
              iconSize={44}
              containerStyle={{ backgroundColor: cardBackground }}
              disabled={s.disable}
            />
          </View>
        ))}
      </View>
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
  heading: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.2,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
