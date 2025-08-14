// ===== File: app/(main)/services/qrcodes/index.tsx =====
import ActionSheet from '@/components/ActionSheet';
import QRCodeItem from '@/components/QRcodes/QRCodeItem';
import type { QRCodeItemType } from '@/types/qrTypes';
import { getQRCodeById, getQRCodesList } from '@/utils/qrService';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { Skeleton } from 'moti/skeleton';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, Layout } from 'react-native-reanimated';

export default function QRCodesScreen() {
  const router = useRouter();
  const [qrCodes, setQrCodes] = useState<QRCodeItemType[]>([]);
  const [selectedItem, setSelectedItem] = useState<QRCodeItemType | null>(null);
  const [selectedQR, setSelectedQR] = useState<QRCodeItemType | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQRCodes = useCallback(async () => {
    try {
      const response = await getQRCodesList(50, 0);
      setQrCodes(response.data);
      setError(null);
    } catch (e) {
      setError('Ошибка загрузки QR кодов');
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Стартовая загрузка с небольшим отложенным skeleton
    setLoading(true);
    const t = setTimeout(loadQRCodes, 120);
    return () => clearTimeout(t);
  }, [loadQRCodes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadQRCodes();
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

  const handleCreate = useCallback(() => {
    // Иногда элементы «не кликаются» из‑за перекрытия бэкдропом чужого компонента.
    // Рендерим ActionSheet только когда он реально нужен (см. ниже) и гарантируем, что
    // у кнопки высокий zIndex.
    router.push('/(main)/services/qrcodes/form?id=new');
  }, [router]);

  const handleEdit = useCallback((id: string) => {
    router.push(`/(main)/services/qrcodes/form?id=${id}`);
  }, [router]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: '#fff' }]}>
        <Animated.View entering={FadeInDown.duration(250)} style={{ marginBottom: 16 }}>
          <View style={[styles.createButton, { backgroundColor: '#007AFF' }]}
          >
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.createButtonText}>Создать QR код</Text>
          </View>
        </Animated.View>
        {/* Скелеты карточек */}
        <View>
          {Array.from({ length: 6 }).map((_, i) => (
            <Animated.View key={i} entering={FadeInDown.delay(i * 60)} style={[styles.skeletonCard]}
            >
              <Skeleton height={40} width={40} radius={20} colorMode="light" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Skeleton height={14} width={'60%'} colorMode="light" />
                <View style={{ height: 6 }} />
                <Skeleton height={10} width={"40%"} colorMode="light" />
              </View>
              <Skeleton height={12} width={28} colorMode="light" />
            </Animated.View>
          ))}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: '#fff' }]}>
        <Text style={{ color: '#000', fontSize: 16, marginBottom: 12 }}>{error}</Text>
        <Pressable onPress={loadQRCodes} style={[styles.retryBtn]}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: '#fff' }]}>
      <Animated.View entering={FadeInDown.duration(250)} style={{ marginBottom: 16, zIndex: 1 }}>
        <Pressable style={styles.createButton} onPress={handleCreate}>
          <Ionicons name="add" size={24} color="white" />
          <Text style={styles.createButtonText}>Создать QR код</Text>
        </Pressable>
      </Animated.View>

      <Animated.View style={{ flex: 1 }} entering={FadeIn} exiting={FadeOut}>
        <FlatList
          data={qrCodes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 50)} layout={Layout.springify()}
            >
              <QRCodeItem
                item={item}
                loading={false}
                onPress={() => setSelectedItem(item)}
                onLongPress={() => setSelectedItem(item)}
              />
            </Animated.View>
          )}
        />
      </Animated.View>

      {/* Рендерим ActionSheet только при наличии selectedItem, чтобы исключить перекрытие кликов */}
      {selectedItem && (
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
      )}

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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  createButtonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '700',
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f1f1',
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
    backgroundColor: '#fff',
  },
  retryBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
});
