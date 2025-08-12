import { QRCodeForm } from '@/components/QRcodes/QRCodeForm';
import type { QRCodeItemType } from '@/types/qrTypes';
import { getQRCodeById } from '@/utils/qrService';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

type ServicesStackParamList = {
  QRCodeForm: { id?: string };
};

export default function QRCodeFormScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ServicesStackParamList, 'QRCodeForm'>>();
  const { id } = route.params || {};

  const [initialData, setInitialData] = useState<QRCodeItemType | null>(null);
  const [loading, setLoading] = useState(false);

  const isNew = !id || id === 'new';

  useEffect(() => {
    if (!isNew && id) {
      setLoading(true);
      getQRCodeById(id)
        .then(data => setInitialData(data))
        .catch(() => {
          Alert.alert('Ошибка', 'Не удалось загрузить данные QR-кода');
          navigation.goBack();
        })
        .finally(() => setLoading(false));
    }
  }, [id]);

  const handleSuccess = () => {
    Alert.alert('Успешно', isNew ? 'QR код создан' : 'QR код обновлён');
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <QRCodeForm
        mode={isNew ? 'create' : 'edit'}
        initialData={isNew ? undefined : initialData ?? undefined}
        onSuccess={handleSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
