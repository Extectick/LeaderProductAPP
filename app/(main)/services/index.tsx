import { services as staticServices } from '@/constants/servicesRoutes';
import { useThemeColor } from '@/hooks/useThemeColor';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import ServiceCard from './ServiceCard';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type ServicesStackParamList = {
  ServicesMain: undefined;
  QrCodes: undefined;
};

type ServicesScreenNavigationProp = NativeStackNavigationProp<ServicesStackParamList, 'ServicesMain'>;

export default function ServicesScreen() {
  const [services, setServices] = useState<typeof staticServices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const navigation = useNavigation<ServicesScreenNavigationProp>();
  const { width } = useWindowDimensions();

  const isMobile = width < 600;
  const numColumns = isMobile ? 2 : 4;
  const spacing = 12;
  const itemSize = width / numColumns - spacing * 2;

  useEffect(() => {
    const fetchServices = async () => {
      try {
        await new Promise((res) => setTimeout(res, 1000));
        setServices(staticServices);
      } catch (e) {
        setError('Не удалось загрузить сервисы');
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  const background = useThemeColor({}, 'cardBackground');
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
        <Text style={{ color: textColor, fontSize: 16 }}>
          {error ?? 'Ошибка'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <FlatList
        data={services}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeIn.delay(index * 100)}>
            <ServiceCard
              icon={item.icon}
              name={item.name}
              size={itemSize}
              onPress={() => {
                console.log('Navigating to:', item.route);
                if (item.route === '/services/qrcodes') {
                  navigation.navigate('QrCodes');
                } else {
                  console.warn('Навигация для маршрута', item.route, 'не реализована');
                }
              }}
              gradient={item.gradient}
              iconSize={40}
              disableShadow={false}
              disableScaleOnPress={false}
            />
          </Animated.View>
        )}
        keyExtractor={(item) => item.name}
        numColumns={numColumns}
        columnWrapperStyle={{ gap: spacing, marginBottom: spacing }}
        contentContainerStyle={{ padding: spacing }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
