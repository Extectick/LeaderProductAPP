// ===== File: app/(main)/services/qrcodes/index.tsx =====
import ActionSheet from '@/components/ActionSheet';
import QRCodeItem from '@/components/QRcodes/QRCodeItem';
import type { QRCodeItemType } from '@/types/qrTypes';
import { deleteQRCode, getQRCodeById, getQRCodesList } from '@/utils/qrService';
import { Ionicons } from '@expo/vector-icons';
// legacy API для кэш-директории/кодировок
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useRouter } from 'expo-router';
import { Skeleton } from 'moti/skeleton';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, Layout } from 'react-native-reanimated';
import { useThemeColor } from '@/hooks/useThemeColor';

const Header = ({
  onCreate,
  onAnalytics,
  count,
}: {
  onCreate: () => void;
  onAnalytics: () => void;
  count: number;
}) => {
  return (
    <Animated.View entering={FadeInDown.duration(250)} style={{ marginBottom: 16, zIndex: 1 }}>
      <LinearGradient
        colors={['#0EA5E9', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerCard}
      >
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>QR-коды</Text>
          <Text style={styles.headerSubtitle}>Создавайте, управляйте и смотрите метрики</Text>
        </View>

        <View style={styles.headerButtonsRow}>
          <Pressable
            onPress={onCreate}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            android_ripple={{ color: 'rgba(0,0,0,0.07)' }}
          >
            <Ionicons name="add" size={18} color="#0B1220" />
            <Text style={styles.primaryBtnText}>Создать</Text>
          </Pressable>

          <Pressable
            onPress={onAnalytics}
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
          >
            <Ionicons name="analytics" size={18} color="#fff" />
            <Text style={styles.secondaryBtnText}>Аналитика</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{Number.isFinite(count) ? count : 0}</Text>
            </View>
          </Pressable>
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

export default function QRCodesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
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
    setLoading(true);
    const t = setTimeout(loadQRCodes, 120);
    return () => clearTimeout(t);
  }, [loadQRCodes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadQRCodes();
  }, [loadQRCodes]);

  useFocusEffect(
    React.useCallback(() => {
      if (!loading) {
        onRefresh();
      }
      return () => {};
    }, [loading, onRefresh])
  );

  const handleDeleteQR = (id: string) => {
    Alert.alert('Удаление QR кода', 'Вы уверены, что хотите удалить этот QR код?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          setQrCodes(prev => prev.filter(qr => qr.id !== id));
          deleteQRCode(id);
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
    router.push('/(main)/services/qrcodes/form?id=new');
  }, [router]);

  const handleAnalytics = useCallback(() => {
    router.push('/(main)/services/qrcodes/analytics');
  }, [router]);

  const handleEdit = useCallback(
    (id: string) => {
      router.push(`/(main)/services/qrcodes/form?id=${id}`);
    },
    [router]
  );

  const numColumns = useMemo(() => {
    if (width >= 1280) return 3;
    if (width >= 900) return 2;
    return 1;
  }, [width]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        {/* Скелетон шапки */}
        <Animated.View entering={FadeInDown.duration(250)} style={{ marginBottom: 16 }}>
          <View style={styles.headerCardSkeleton}>
            <Skeleton height={20} width={'45%'} radius={6} colorMode="light" />
            <View style={{ height: 6 }} />
            <Skeleton height={12} width={'70%'} radius={6} colorMode="light" />
            <View style={styles.headerSkeletonButtonsRow}>
              <Skeleton height={36} width={120} radius={999} colorMode="light" />
              <Skeleton height={36} width={140} radius={999} colorMode="light" />
            </View>
          </View>
        </Animated.View>

        {/* Список скелетонов */}
        <View>
          {Array.from({ length: 6 }).map((_, i) => (
            <Animated.View key={i} entering={FadeInDown.delay(i * 60)} style={[styles.skeletonCard]}>
              <Skeleton height={40} width={40} radius={20} colorMode="light" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Skeleton height={14} width={'60%'} colorMode="light" />
                <View style={{ height: 6 }} />
                <Skeleton height={10} width={'40%'} colorMode="light" />
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
      <View style={[styles.centered, { backgroundColor: background }]}>
        <Text style={{ color: textColor, fontSize: 16, marginBottom: 12 }}>{error}</Text>
        <Pressable onPress={loadQRCodes} style={[styles.retryBtn]}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <Header onCreate={handleCreate} onAnalytics={handleAnalytics} count={qrCodes.length} />

      <Animated.View style={{ flex: 1 }} entering={FadeIn} exiting={FadeOut}>
        <FlatList
          data={qrCodes}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
          contentContainerStyle={{ paddingBottom: 16, gap: 12, paddingHorizontal: numColumns > 1 ? 4 : 0 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInDown.delay(index * 40)}
              layout={Layout.springify()}
              style={[
                styles.qrCardWrapper,
                { backgroundColor: cardBackground, borderColor: '#E5E7EB' },
                numColumns > 1 ? { flex: 1 } : null,
              ]}
            >
              <QRCodeItem
                item={item}
                loading={false}
                onPress={() => setSelectedItem(item)}
                onLongPress={() => setSelectedItem(item)}
              />
            </Animated.View>
          )}
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: cardBackground }]}>
              <Ionicons name="qr-code-outline" size={32} color="#9CA3AF" />
              <Text style={{ color: textColor, fontWeight: '700', marginTop: 8 }}>Пока нет QR-кодов</Text>
              <Text style={{ color: '#6B7280', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                Создайте первый, чтобы начать отслеживать печать и сканы.
              </Text>
              <Pressable onPress={handleCreate} style={[styles.primaryBtn, { marginTop: 12 }]}>
                <Ionicons name="add" size={18} color="#0B1220" />
                <Text style={styles.primaryBtnText}>Создать</Text>
              </Pressable>
            </View>
          }
        />
      </Animated.View>

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
          <Pressable style={styles.closeButton} onPress={() => setSelectedQR(null)}>
            <Ionicons name="close" size={24} color="white" />
          </Pressable>

          {selectedQR.qrImage ? (
            <Image source={{ uri: selectedQR.qrImage }} style={styles.detailImage} />
          ) : (
            <Text>QR изображение не найдено</Text>
          )}

          <Text style={styles.detailDescription} numberOfLines={3} ellipsizeMode="tail">
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
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },

  // ----- HEADER -----
  headerCard: {
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
    // Тени
    shadowColor: '#7C3AED',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  headerTextBlock: {
    marginBottom: 12,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 20,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 13,
    marginTop: 4,
  },
  headerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  primaryBtnText: {
    color: '#0B1220',
    fontWeight: '800',
    marginLeft: 6,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  secondaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 6,
    marginRight: 6,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.96 },

  // ----- HEADER SKELETON -----
  headerCardSkeleton: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#F4F6FA',
    borderWidth: 1,
    borderColor: '#EEF2FF',
  },
  headerSkeletonButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },

  // ----- OLD BUTTONS (оставляем для совместимости в скелетах и т.п.) -----
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
  createButtonText: { color: 'white', marginLeft: 8, fontWeight: '700' },

  // ----- LIST SKELETON -----
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
  qrCardWrapper: {
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
  },
  emptyCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 16,
  },

  // ----- DETAIL -----
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
  detailImage: { width: 200, height: 200, resizeMode: 'contain', marginBottom: 16 },
  detailDescription: {
    fontSize: 10,
    textAlign: 'center',
    marginHorizontal: 12,
    marginTop: 12,
    color: 'black',
    lineHeight: 18,
  },

  // ----- MISC -----
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  retryBtn: { backgroundColor: '#007AFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
});
