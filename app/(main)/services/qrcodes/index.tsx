import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import ActionSheet from '@/components/ActionSheet';
import QRCodeItem from '@/components/QRcodes/QRCodeItem';
import { QRCodeItemType as QRCodeType } from '@/types/qrTypes'; // ваш тип QRCodeItem из types
import { getQRCodeById, getQRCodesList } from '@/utils/qrService';

export default function QRCodesScreen() {
  const router = useRouter();

  const [qrCodes, setQrCodes] = useState<QRCodeType[]>([]);
  const [selectedItem, setSelectedItem] = useState<QRCodeType | null>(null);
  const [selectedQR, setSelectedQR] = useState<QRCodeType | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Загрузка списка QR кодов
  const loadQRCodes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getQRCodesList(50, 0); // например, лимит 50, оффсет 0
      setQrCodes(response.data);
    } catch (e) {
      setError('Ошибка загрузки QR кодов');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQRCodes();
  }, [loadQRCodes]);

  // Удаление QR кода
  const handleDeleteQR = (id: string) => {
    Alert.alert(
      'Удаление QR кода',
      'Вы уверены, что хотите удалить этот QR код?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            setQrCodes(prev => prev.filter(qr => qr.id !== id));
            Alert.alert('Успешно', 'QR код удален');
            setSelectedItem(null);
          }
        }
      ]
    );
  };

  // Загрузка и сохранение QR кода (скачивание)
  const handleDownloadQR = async (qr: QRCodeType) => {
    // console.log('Попытка Скачивание..')
    try {
      setQrLoading(true);
      const fullQR = await getQRCodeById(qr.id);

      if (!fullQR.qrImage) {
        Alert.alert('Ошибка', 'Изображение QR кода отсутствует');
        return;
      }

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = fullQR.qrImage;
        link.download = `qr-code-${qr.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert('Успешно', 'QR код скачан');
      } else {
        const fileUri = `${FileSystem.cacheDirectory}qr-code-${qr.id}.png`;

        if (fullQR.qrImage.startsWith('data:')) {
          const base64Data = fullQR.qrImage.split(',')[1];
          await FileSystem.writeAsStringAsync(fileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
        } else {
          await FileSystem.downloadAsync(fullQR.qrImage, fileUri);
        }

        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Ошибка', 'Нет разрешения на сохранение в галерею');
          return;
        }

        const asset = await MediaLibrary.createAssetAsync(fileUri);
        await MediaLibrary.createAlbumAsync('QR Codes', asset, false);
        Alert.alert('Успешно', 'QR код сохранён в галерею');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Ошибка', 'Не удалось скачать QR код');
    } finally {
      setQrLoading(false);
    }
  };

  // Если открыта форма создания/редактирования — пока простой заглушка
  if (showForm) {
    return (
      <View style={styles.container}>
        <Text>Форма создания QR кода (реализуйте по необходимости)</Text>
        <Pressable onPress={() => setShowForm(false)} style={styles.backButton}>
          <Text style={{color: '#007AFF'}}>Назад к списку</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.createButton} onPress={() => setShowForm(true)}>
        <Ionicons name="add" size={24} color="white" />
        <Text style={styles.createButtonText}>Создать QR код</Text>
      </Pressable>

      {error && <Text style={{ color: 'red', marginBottom: 10 }}>{error}</Text>}

      <FlatList
        data={qrCodes}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <QRCodeItem
            item={item}
            loading={loading}
            onPress={() => setSelectedItem(item)}
            onLongPress={() => setSelectedItem(item)}
          />
        )}
        contentContainerStyle={{ paddingBottom: 16 }}
      />

      {/* Модальное окно для просмотра выбранного QR кода */}
      <Modal visible={!!selectedQR} transparent animationType="fade" onRequestClose={() => setSelectedQR(null)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {selectedQR?.qrImage ? (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="qr-code" size={120} color="#000" />
                <Text style={{ marginVertical: 8, fontWeight: '600' }}>{selectedQR.description || 'Без описания'}</Text>
              </View>
            ) : (
              <Text>{selectedQR?.description || 'Без описания'}</Text>
            )}
            <Pressable onPress={() => setSelectedQR(null)} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ActionSheet для мобильных (и web) */}
      <ActionSheet
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        buttons={[
          {
            title: 'Редактировать',
            icon: 'pencil',
            onPress: () => setShowForm(true),
          },
          {
            title: 'Просмотреть',
            icon: 'eye',
            onPress: async () => {
              if (!selectedItem) return;
              setQrLoading(true);
              try {
                const fullQR = await getQRCodeById(selectedItem.id);
                console.log(fullQR)
                setSelectedQR(fullQR);
              } catch (e) {
                Alert.alert('Ошибка', 'Не удалось загрузить QR код');
              } finally {
                setQrLoading(false);
                setSelectedItem(null);
              }
            }
          },
          {
            title: 'Скачать',
            icon: 'download',
            onPress: () => selectedItem && handleDownloadQR(selectedItem),
          },
          {
            title: 'Удалить',
            icon: 'trash',
            destructive: true,
            onPress: () => selectedItem && handleDeleteQR(selectedItem.id),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  createButtonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '500',
  },
  backButton: {
    marginTop: 12,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#FF3B30',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
