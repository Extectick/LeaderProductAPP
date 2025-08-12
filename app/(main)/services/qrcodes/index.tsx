import ActionSheet from '@/components/ActionSheet';
import { QRCodeForm } from '@/components/QRcodes/QRCodeForm';
import QRCodeItem from '@/components/QRcodes/QRCodeItem';
import { QRCodeItemType as QRCodeType } from '@/types/qrTypes';
import { getQRCodeById, getQRCodesList } from '@/utils/qrService';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

export default function QRCodesScreen() {
  const router = useRouter();

  const [qrCodes, setQrCodes] = useState<QRCodeType[]>([]);
  const [selectedItem, setSelectedItem] = useState<QRCodeType | null>(null);
  const [selectedQR, setSelectedQR] = useState<QRCodeType | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [showForm, setShowForm] = useState<QRCodeType | null | false>(false);
  const [error, setError] = useState<string | null>(null);

  // Загрузка QR-кодов
  const loadQRCodes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getQRCodesList(50, 0);
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
            setSelectedQR(null); // очистить при удалении, если он выбран
          },
        },
      ]
    );
  };

  // Загрузка и сохранение QR кода (скачивание)
  const handleDownloadQR = async (qr: QRCodeType) => {
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
          await FileSystem.writeAsStringAsync(fileUri, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
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

  // Если открыта форма создания/редактирования
    {showForm !== false && (
      <View style={styles.container}>
        <QRCodeForm
          mode={showForm ? 'edit' : 'create'}
          initialData={showForm || undefined as any}
          onSuccess={() => {
            setShowForm(false);
            setSelectedItem(null);
            loadQRCodes();
          }}
        />
        <Pressable
          onPress={() => {
            setShowForm(false);
            setSelectedItem(null);
          }}
          style={styles.backButton}
        >
          <Text style={{ color: '#007AFF' }}>Назад к списку</Text>
        </Pressable>
      </View>
    )}
  
  return (
    <View style={styles.container}>
      <Pressable
        style={styles.createButton}
        onPress={() => {
          setSelectedItem(null); // сброс редактирования
          setShowForm(null);     // открытие формы
        }}
      >
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

      {/* Блок просмотра выбранного QR-кода (вместо модального окна) */}
      {selectedQR && (
        <View style={styles.detailContainer}>
          <Pressable
            style={styles.closeButton}
            onPress={() => setSelectedQR(null)}
          >
            <Ionicons name="close" size={24} color="white" />
          </Pressable>

          {selectedQR.qrImage ? (
            <Image
              source={{ uri: selectedQR.qrImage }}
              style={styles.detailImage}
            />
          ) : (
            <Text>QR изображение не найдено</Text>
          )}

          <Text
            style={styles.detailDescription}
            numberOfLines={3}
            ellipsizeMode="tail"
          >
            {selectedQR.description || 'Без описания'}
            
          </Text>
        </View>
      )}
      
      {/* ActionSheet для мобильных (и web) */}
      <ActionSheet
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        buttons={[
          {
            title: 'Редактировать',
            icon: 'pencil',
            
            onPress: () => {
              if (!selectedItem) {
                // console.log('НЕТ ДАННЫХ QR код')
                return;
              }
              console.log('ID qr кода:   ' + selectedItem.id)
              
              setSelectedItem(selectedItem);
              setShowForm(selectedItem)
            }
          },
          {
            title: 'Просмотреть',
            icon: 'eye',
            onPress: async () => {
              if (!selectedItem) return;
              setQrLoading(true);
              try {
                const fullQR = await getQRCodeById(selectedItem.id);
                setSelectedQR(fullQR);
              } catch (e) {
                Alert.alert('Ошибка', 'Не удалось загрузить QR код');
              } finally {
                setQrLoading(false);
                setSelectedItem(null);
              }
            },
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

  detailContainer: {
    marginTop: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    position: 'relative',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },

  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'red',
    borderRadius: 20,
    padding: 6,
    zIndex: 10,
  },

  detailImage: {
    width: 200,
    height: 200,
    resizeMode: 'contain',
    marginBottom: 16,
  },

  detailDescription: {
    fontSize: 10,          // чуть меньше, чем обычно
    textAlign: 'center',
    marginHorizontal: 12,  // отступы слева и справа
    marginTop: 12,
    color: 'black',        // или используйте цвет из темы
    lineHeight: 18,        // чтобы строки были не слишком плотными
  },
});
