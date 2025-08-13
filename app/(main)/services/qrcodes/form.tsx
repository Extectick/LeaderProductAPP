import { QRCodeForm } from '@/components/QRcodes/QRCodeForm';
import type { QRCodeItemType } from '@/types/qrTypes';
import { getQRCodeById } from '@/utils/qrService';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    StyleSheet,
    Text,
    View,
} from 'react-native';

export default function QRCodeFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [initialData, setInitialData] = useState<QRCodeItemType | null>(null);
  const [loading, setLoading] = useState(false);

  const isNew = !id || id === 'new';

  // Для анимации
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!isNew && id) {
      setLoading(true);
      getQRCodeById(id as string)
        .then((data) => setInitialData(data))
        .catch(() => {
          Alert.alert('Ошибка', 'Не удалось загрузить данные QR-кода');
          router.back();
        })
        .finally(() => setLoading(false));
    }
  }, [id]);

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(translateAnim, {
          toValue: 0,
          friction: 6,
          tension: 50,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading]);

  const handleSuccess = () => {
    Alert.alert('Успешно', isNew ? 'QR код создан' : 'QR код обновлён');
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>
          {isNew ? 'Загружаем форму...' : 'Загружаем данные QR-кода...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Animated.View
        style={[
          styles.container,
          { opacity: fadeAnim, transform: [{ translateY: translateAnim }] },
        ]}
      >
        <QRCodeForm
          mode={isNew ? 'create' : 'edit'}
          initialData={isNew ? undefined : initialData ?? undefined}
          onSuccess={handleSuccess}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
});
