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

  // Анимации появления
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    let isMounted = true;
    if (!isNew && id) {
      setLoading(true);
      getQRCodeById(id as string)
        .then((data) => {
          if (isMounted) setInitialData(data);
        })
        .catch(() => {
          Alert.alert('Ошибка', 'Не удалось загрузить данные QR-кода', [
            { text: 'OK', onPress: () => router.back() },
          ]);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
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
    Alert.alert('Успешно', isNew ? 'QR код создан' : 'QR код обновлён', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>
          {isNew ? 'Подготавливаем форму...' : 'Загружаем QR-код...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Animated.View
        style={[
          styles.card,
          { opacity: fadeAnim, transform: [{ translateY: translateAnim }] },
        ]}
      >
        <QRCodeForm
          mode={isNew ? 'create' : 'edit'}
          initialData={!isNew && initialData ? initialData : undefined}
          onSuccess={handleSuccess}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
  },
});
