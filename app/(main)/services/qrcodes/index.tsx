import ActionSheet from '@/components/ActionSheet';
import { getQRCodesList } from '@/utils/qrService';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type QRType = 'PHONE'|'LINK'|'EMAIL'|'TEXT'|'WHATSAPP'|'TELEGRAM'|'CONTACT';

interface QRCode {
  id: string;
  qrData: string;
  description: string | null;
  status: 'ACTIVE'|'INACTIVE';
  createdAt: string;
  createdBy: {
    id: number;
    email: string;
  };
  image?: string; // Добавляем опциональное поле для локального использования
}

export default function QRCodesScreen() {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<QRCode | null>(null);
  const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedQR, setSelectedQR] = useState<QRCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pagination, setPagination] = useState({
    limit: 10,
    offset: 0,
    total: 0
  });
  
  const loadQRCodes = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await getQRCodesList(pagination.limit, pagination.offset);
      setQrCodes(response.data);
      setPagination(prev => ({
        ...prev,
        total: response.meta.total
      }));
    } catch (err) {
      setError('Ошибка загрузки QR кодов');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, pagination.offset]);

  React.useEffect(() => {
    loadQRCodes();
  }, []);

  const handleCreateQR = () => setShowForm(true);

  const handleDeleteQR = async (id: string) => {
    Alert.alert(
      'Удаление QR кода',
      'Вы уверены, что хотите удалить этот QR код?',
      [
        { text: 'Отмена', style: 'cancel' },
        { 
          text: 'Удалить', 
          style: 'destructive',
          onPress: async () => {
            try {
              // Здесь будет вызов API для удаления
              setQrCodes(qrCodes.filter(qr => qr.id !== id));
              Alert.alert('Успешно', 'QR код удален');
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось удалить QR код');
              console.error(error);
            }
          }
        }
      ]
    );
  };

  const handleDownloadQR = async (qr: QRCode) => {
    if (!qr.image) {
      Alert.alert('Ошибка', 'Нет изображения QR кода для скачивания');
      return;
    }

    if (Platform.OS === 'web') {
      // Для веба
      const link = document.createElement('a');
      link.href = qr.image;
      link.download = `qr-code-${qr.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      Alert.alert('Успешно', 'QR код скачан');
    } else {
      try {
        let fileUri = `${FileSystem.cacheDirectory}qr-code-${qr.id}.png`;

        if (qr.image?.startsWith('data:')) {
          // Обработка base64 изображения
          const base64Data = qr.image.split(',')[1];
          await FileSystem.writeAsStringAsync(fileUri, base64Data, {
            encoding: FileSystem.EncodingType.Base64
          });
        } else {
          // Обработка http/https URL
          await FileSystem.downloadAsync(qr.image, fileUri);
        }

        // Для всех платформ используем MediaLibrary
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Ошибка', 'Необходимо разрешение для сохранения в галерею');
          return;
        }
        
        const asset = await MediaLibrary.createAssetAsync(fileUri);
        await MediaLibrary.createAlbumAsync('QR Codes', asset, false);
        Alert.alert('Успешно', 'QR код сохранён в галерею');
      } catch (error) {
        console.error('Ошибка сохранения QR кода:', error);
        Alert.alert('Ошибка', 'Не удалось сохранить QR код');
      }
    }
  };

  if (showForm || qrCodes.length === 0) {
    return (
      <View style={styles.container}>
        <Text>Форма создания QR кода</Text>
        <Pressable onPress={() => setShowForm(false)}>
          <Text>Назад к списку</Text>
        </Pressable>
      </View>
    );
  }

  const isWeb = Platform.OS === 'web';

  return (
    <View style={[styles.container, isWeb && styles.webContainer]}>
      <Pressable style={styles.createButton} onPress={handleCreateQR}>
        <Ionicons name="add" size={24} color="white" />
        <Text style={styles.createButtonText}>Создать QR код</Text>
      </Pressable>

      <FlatList
        data={qrCodes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.qrItem, isWeb && styles.webQrItem]}>
            <View style={styles.qrPreview}>
              {item.image ? (
                <Image 
                  source={{ uri: item.image }} 
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              ) : (
                <Text>{item.qrData}</Text>
              )}
              {item.description && <Text>{item.description}</Text>}
            </View>
            
            {Platform.OS === 'web' ? (
              <View style={styles.qrActions}>
                <Pressable onPress={() => setShowForm(true)}>
                  <Ionicons name="pencil" size={20} color="#007AFF" />
                </Pressable>
                <Pressable onPress={() => setSelectedQR(item)}>
                  <Ionicons name="eye" size={20} color="#34C759" />
                </Pressable>
                <Pressable onPress={() => handleDownloadQR(item)}>
                  <Ionicons name="download" size={20} color="#5856D6" />
                </Pressable>
                <Pressable onPress={() => handleDeleteQR(item.id)}>
                  <Ionicons name="trash" size={20} color="#FF3B30" />
                </Pressable>
              </View>
            ) : (
              <Pressable 
                onPress={() => setSelectedItem(item)}
                style={styles.mobileActionsButton}
              >
                <Ionicons name="ellipsis-horizontal" size={24} color="#8E8E93" />
              </Pressable>
            )}
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />

      <Modal
        visible={!!selectedQR}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedQR(null)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, isWeb && styles.webModalContent]}>
            {selectedQR?.image ? (
              <Image 
                source={{ uri: selectedQR.image }} 
                style={styles.qrImage}
                resizeMode="contain"
              />
            ) : (
              <Text>{selectedQR?.qrData || 'QR код не сгенерирован'}</Text>
            )}
            <Pressable 
              style={styles.closeButton}
              onPress={() => setSelectedQR(null)}
            >
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
          </View>
        </View>
      </Modal>

      <ActionSheet
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        buttons={[
          {
            title: 'Редактировать',
            icon: 'pencil',
            onPress: () => setShowForm(true)
          },
          {
            title: 'Просмотреть',
            icon: 'eye',
            onPress: () => selectedItem && setSelectedQR(selectedItem)
          },
          {
            title: 'Скачать',
            icon: 'download',
            onPress: () => selectedItem && handleDownloadQR(selectedItem)
          },
          {
            title: 'Удалить',
            icon: 'trash',
            destructive: true,
            onPress: () => selectedItem && handleDeleteQR(selectedItem.id)
          }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  webContainer: {
    maxWidth: 1200,
    width: '100%',
    marginHorizontal: 'auto',
  },
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
  listContent: {
    paddingBottom: 16,
  },
  qrItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  webQrItem: {
    padding: 24,
  },
  qrPreview: {
    flex: 1,
  },
  qrImage: {
    width: 100,
    height: 100,
    marginRight: 16,
  },
  qrActions: {
    flexDirection: 'row',
    gap: 16,
  },
  mobileActionsButton: {
    padding: 8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  webModalContent: {
    maxWidth: 600,
    padding: 32,
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
