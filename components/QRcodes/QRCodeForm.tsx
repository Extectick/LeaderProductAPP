import { useThemeColor } from '@/hooks/useThemeColor';
import { createQRCode, updateQRCode } from '@/utils/qrService';
import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Button,
    Platform,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

const qrTypes = ['PHONE', 'EMAIL', 'URL', 'TEXT', 'CONTACT', 'WIFI', 'WHATSAPP', 'TELEGRAM'];

type Props = {
  mode: 'create' | 'edit';
  initialData?: {
    id: string;
    qrType: string;
    description?: string;
    qrData?: string | Record<string, string> | null;
  } | null;
  onSuccess?: () => void;
};

export const QRCodeForm: React.FC<Props> = ({ mode, initialData, onSuccess }) => {
  const textColor = useThemeColor({}, 'text');
  const bgColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({}, 'inputBorder');

  const [qrType, setQrType] = useState('PHONE');
  const [description, setDescription] = useState('');
  const [qrData, setQrData] = useState<any>({});
  const [loading, setLoading] = useState<boolean>(mode === 'edit' && !initialData);

  useEffect(() => {
    if (initialData) {
      setQrType(initialData.qrType);
      setDescription(initialData.description || '');

      try {
        const parsed = typeof initialData.qrData === 'string' ? JSON.parse(initialData.qrData) : initialData.qrData;
        setQrData(parsed);
      } catch {
        setQrData(initialData.qrData);
      }
    }
  }, [initialData]);

  const handleSubmit = async () => {
    let payload = {
      qrType,
      description,
      qrData,
    };

    if (
      ['PHONE', 'EMAIL', 'URL', 'TEXT', 'WHATSAPP', 'TELEGRAM', 'WIFI'].includes(qrType)
    ) {
      payload.qrData = typeof qrData === 'string' ? qrData : qrData.value;
    }

    try {
      if (mode === 'edit' && initialData?.id) {
        await updateQRCode(initialData.id, payload.qrType, payload.qrData, payload.description);
        Alert.alert('Успешно', 'QR-код обновлён');
      } else {
        await createQRCode(payload.qrType, payload.qrData, payload.description);
        Alert.alert('Успешно', 'QR-код создан');
      }

      onSuccess?.();
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось сохранить QR-код');
    }
  };

  const renderFields = () => {
    if (qrType === 'CONTACT') {
      return (
        <>
          {['name', 'phone', 'email', 'url', 'company', 'note'].map((field) => (
            <TextInput
              key={field}
              placeholder={field}
              value={qrData[field] || ''}
              onChangeText={(text) =>
                setQrData((prev: any) => ({ ...prev, [field]: text }))
              }
              style={{
                borderColor,
                borderWidth: 1,
                marginBottom: 10,
                padding: 10,
                color: textColor,
              }}
              placeholderTextColor={textColor}
            />
          ))}
        </>
      );
    }

    return (
      <TextInput
        placeholder="Введите данные"
        value={typeof qrData === 'string' ? qrData : qrData.value || ''}
        onChangeText={(text) =>
          setQrData(typeof qrData === 'string' ? text : { value: text })
        }
        style={{
          borderColor,
          borderWidth: 1,
          marginBottom: 10,
          padding: 10,
          color: textColor,
        }}
        placeholderTextColor={textColor}
      />
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={textColor} />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: bgColor, padding: 20 }}>
      <Text style={{ color: textColor, fontSize: 18, marginBottom: 10 }}>
        Тип QR-кода
      </Text>
      <View
        style={{
          borderColor,
          borderWidth: Platform.OS === 'android' ? 0 : 1,
          marginBottom: 20,
        }}
      >
        <Picker
          selectedValue={qrType}
          onValueChange={(itemValue) => {
            setQrType(itemValue);
            setQrData({});
          }}
          style={{ color: textColor }}
        >
          {qrTypes.map((type) => (
            <Picker.Item key={type} label={type} value={type} />
          ))}
        </Picker>
      </View>

      <Text style={{ color: textColor, fontSize: 18, marginBottom: 10 }}>
        Описание
      </Text>
      <TextInput
        placeholder="Описание"
        value={description}
        onChangeText={setDescription}
        style={{
          borderColor,
          borderWidth: 1,
          marginBottom: 20,
          padding: 10,
          color: textColor,
        }}
        placeholderTextColor={textColor}
      />

      <Text style={{ color: textColor, fontSize: 18, marginBottom: 10 }}>
        Данные QR-кода
      </Text>
      {renderFields()}

      <Button title={mode === 'edit' ? 'Обновить QR' : 'Создать QR'} onPress={handleSubmit} />
    </ScrollView>
  );
};
