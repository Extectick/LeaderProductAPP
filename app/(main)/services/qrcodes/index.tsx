import ActionSheet from '@/components/ActionSheet';
import QRCodeItem from '@/components/QRcodes/QRCodeItem';
import type { QRCodeItemType } from '@/types/qrTypes';
import { getQRCodeById, getQRCodesList } from '@/utils/qrService';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function QRCodesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [qrCodes, setQrCodes] = useState<QRCodeItemType[]>([]);
  const [selectedItem, setSelectedItem] = useState<QRCodeItemType | null>(null);
  const [selectedQR, setSelectedQR] = useState<QRCodeItemType | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQRCodes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getQRCodesList(50, 0);
      setQrCodes(response.data);
      setError(null);
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

  const handleDeleteQR = (id: string) => {
    Alert.alert('Удаление QR кода', 'Вы уверены, что хотите удалить этот QR код?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          setQrCodes(prev => prev.filter(qr => qr.id !== id));
          Alert.alert('Успешно', 'QR код удален');
          setSelectedItem(null);
          setSelectedQR(null);
        },
      },
    ]);
  };

  const handleDownloadQR = async (qr: QRCodeItemType) => {
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

  const handleCreate = () => {
    router.push('/(main)/services/qrcodes/form?id=new');
  };

  const handleEdit = (id: string) => {
    router.push(`/(main)/services/qrcodes/form?id=${id}`);
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: '#fff' }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: '#fff' }]}>
        <Text style={{ color: '#000', fontSize: 16 }}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: '#fff' }]}>
      <Pressable style={styles.createButton} onPress={handleCreate}>
        <Ionicons name="add" size={24} color="white" />
        <Text style={styles.createButtonText}>Создать QR код</Text>
      </Pressable>

      <FlatList
        data={qrCodes}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 16 }}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeIn.delay(index * 50)}>
            <QRCodeItem
              item={item}
              loading={loading}
              onPress={() => setSelectedItem(item)}
              onLongPress={() => setSelectedItem(item)}
            />
          </Animated.View>
        )}
      />

      <ActionSheet
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        buttons={[
          {
            title: 'Редактировать',
            icon: 'pencil',
            onPress: () => {
              if (selectedItem) {
                handleEdit(selectedItem.id);
                setSelectedItem(null);
              }
            },
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
              } catch {
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
            onPress: () => {
              if (selectedItem) {
                handleDownloadQR(selectedItem);
                setSelectedItem(null);
              }
            },
          },
          {
            title: 'Удалить',
            icon: 'trash',
            destructive: true,
            onPress: () => {
              if (selectedItem) {
                handleDeleteQR(selectedItem.id);
              }
            },
          },
        ]}
      />

      {selectedQR && (
        <View style={styles.detailContainer}>
          <Pressable
            style={styles.closeButton}
            onPress={() => setSelectedQR(null)}
          >
            <Ionicons name="close" size={24} color="white" />
          </Pressable>

          {selectedQR.qrImage ? (
            <Image source={{ uri: selectedQR.qrImage }} style={styles.detailImage} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    maxWidth: 1000,
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
    fontSize: 10,
    textAlign: 'center',
    marginHorizontal: 12,
    marginTop: 12,
    color: 'black',
    lineHeight: 18,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
