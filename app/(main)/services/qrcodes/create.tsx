import { QRCodeForm } from '@/components/QRcodes/QRCodeForm';
import { getQRCodeById } from '@/utils/qrService';
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

export default function CreateOrEditQRCodeScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const qrId = route?.params?.qrId;

  const [initialData, setInitialData] = useState<any>(null);
  const [loading, setLoading] = useState(!!qrId);

  useEffect(() => {
    if (qrId) {
      loadQRCode();
    }
  }, [qrId]);

  const loadQRCode = async () => {
    try {
      const qr = await getQRCodeById(qrId);
      setInitialData(qr);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить QR-код');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <QRCodeForm
      mode={qrId ? 'edit' : 'create'}
      initialData={initialData}
      onSuccess={() => navigation.goBack()}
    />
  );
}
