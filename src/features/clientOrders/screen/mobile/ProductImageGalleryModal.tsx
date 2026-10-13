import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Portal, Surface, Text } from 'react-native-paper';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadedProductImageUris, failedProductImageUris } from '../../lib/productImageCache';
export type ProductGalleryImage = { key: string; thumbUrl: string; previewUrl: string; isMain?: boolean };
export type ProductGallery = { title: string; subtitle?: string | null; images: ProductGalleryImage[]; index: number };
export function getProductGalleryImages(item: any): ProductGalleryImage[] {
  const result: ProductGalleryImage[] = [];
  const seen = new Set<string>();
  const pushImage = (input: Partial<ProductGalleryImage> & { previewUrl?: string | null; thumbUrl?: string | null }) => {
    const previewUrl = input.previewUrl || input.thumbUrl || null;
    const thumbUrl = input.thumbUrl || input.previewUrl || null;
    if (!previewUrl || !thumbUrl) return;
    const dedupeKey = `${thumbUrl}|${previewUrl}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    result.push({
      key: input.key || previewUrl,
      thumbUrl,
      previewUrl,
      isMain: input.isMain,
    });
  };

  const images = Array.isArray(item?.images) ? item.images : [];
  [...images]
    .sort((a, b) => Number(!!b?.isMain) - Number(!!a?.isMain))
    .forEach((image: any, index) => {
      pushImage({
        key: image?.id || image?.fileGuid || `image-${index}`,
        thumbUrl: image?.thumbUrl,
        previewUrl: image?.previewUrl,
        isMain: !!image?.isMain,
      });
    });
  pushImage({
    key: item?.imageHash || item?.productGuid || item?.guid || 'primary',
    thumbUrl: item?.imageThumbUrl || item?.thumbnailUrl || item?.imageUrl || item?.pictureUrl || item?.photoUrl,
    previewUrl: item?.imagePreviewUrl || item?.imageUrl || item?.pictureUrl || item?.photoUrl || item?.imageThumbUrl || item?.thumbnailUrl,
    isMain: true,
  });
  return result;
}

export function ProductImageGalleryModal({
  styles = galleryStyles,
  gallery,
  onClose,
}: {
  styles?: any;
  gallery: { title: string; subtitle?: string | null; images: ProductGalleryImage[]; index: number } | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
  const scrollRef = React.useRef<any>(null);
  const [activeIndex, setActiveIndex] = React.useState(gallery?.index || 0);
  const images = gallery?.images || [];
  const stageWidth = width;
  const stageHeight = height;

  React.useEffect(() => {
    if (!gallery) return;
    const nextIndex = Math.min(Math.max(gallery.index || 0, 0), Math.max(gallery.images.length - 1, 0));
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => scrollRef.current?.scrollTo?.({ x: nextIndex * stageWidth, animated: false }));
  }, [gallery?.title, gallery?.index, gallery?.images.length, stageWidth]);

  if (!gallery || !images.length) return null;

  const scrollToIndex = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), images.length - 1);
    setActiveIndex(nextIndex);
    scrollRef.current?.scrollTo?.({ x: nextIndex * stageWidth, animated: true });
  };

  return (
    <Portal>
      <View style={styles.productGalleryOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть просмотр изображения" style={styles.productGalleryBackdrop} onPress={onClose} />
        <Surface mode="flat" style={[styles.productGalleryCard, { width: stageWidth, height: stageHeight }]}>
          <View style={[styles.productGalleryHeader, { top: Math.max(safeTop, 8) + 4 }]}>
            <View style={styles.productGalleryTitleWrap}>
              <Text style={styles.productGalleryTitle} numberOfLines={1}>{gallery.title}</Text>
              <Text style={styles.productGallerySubtitle} numberOfLines={1}>
                {gallery.subtitle || `${activeIndex + 1} из ${images.length}`}
              </Text>
            </View>
            <View style={styles.productGalleryHeaderActions}>
              {images.length > 1 ? <Text style={styles.productGalleryCounter}>{activeIndex + 1}/{images.length}</Text> : null}
              <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" onPress={onClose} style={({ pressed }) => [styles.productGalleryCloseButton, pressed && styles.flatPressed]}>
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / stageWidth);
              setActiveIndex(Math.min(Math.max(nextIndex, 0), images.length - 1));
            }}
            style={{ width: stageWidth }}
          >
            {images.map((image) => (
              <ProductGallerySlide key={image.key} image={image} width={stageWidth} height={stageHeight} styles={styles} />
            ))}
          </ScrollView>
          {images.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.productGalleryThumbsScroll, { bottom: Math.max(safeBottom, 8) + 8 }]}
              contentContainerStyle={styles.productGalleryThumbs}
            >
              {images.map((image, index) => (
                <Pressable
                  key={`thumb-${image.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Показать изображение ${index + 1}`}
                  onPress={() => scrollToIndex(index)}
                  style={({ pressed }) => [
                    styles.productGalleryThumb,
                    activeIndex === index && styles.productGalleryThumbActive,
                    pressed && styles.flatPressed,
                  ]}
                >
                  <ExpoImage source={{ uri: image.thumbUrl }} style={styles.productGalleryThumbImage} contentFit="contain" cachePolicy="memory-disk" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </Surface>
      </View>
    </Portal>
  );
}

function ProductGallerySlide({
  image,
  width,
  height,
  styles,
}: {
  image: ProductGalleryImage;
  width: number;
  height: number;
  styles: any;
}) {
  const imageSource = React.useMemo(() => ({ uri: image.previewUrl }), [image.previewUrl]);
  const [loading, setLoading] = React.useState(!loadedProductImageUris.has(image.previewUrl) && !failedProductImageUris.has(image.previewUrl));
  const [failed, setFailed] = React.useState(failedProductImageUris.has(image.previewUrl));

  React.useEffect(() => {
    const nextFailed = failedProductImageUris.has(image.previewUrl);
    const nextLoaded = loadedProductImageUris.has(image.previewUrl);
    setLoading(!nextLoaded && !nextFailed);
    setFailed(nextFailed);
  }, [image.previewUrl]);

  React.useEffect(() => {
    if (!loading || failed) return undefined;
    const timeout = setTimeout(() => {
      failedProductImageUris.add(image.previewUrl);
      setFailed(true);
      setLoading(false);
    }, 12000);
    return () => clearTimeout(timeout);
  }, [failed, image.previewUrl, loading]);

  const handleImageLoaded = React.useCallback(() => {
    loadedProductImageUris.add(image.previewUrl);
    failedProductImageUris.delete(image.previewUrl);
    setFailed(false);
    setLoading(false);
  }, [image.previewUrl]);

  const handleImageError = React.useCallback(() => {
    failedProductImageUris.add(image.previewUrl);
    loadedProductImageUris.delete(image.previewUrl);
    setFailed(true);
    setLoading(false);
  }, [image.previewUrl]);

  return (
    <View style={[styles.productGallerySlide, { width, height }]}>
      {!failed ? (
        <ExpoImage
          source={imageSource}
          style={styles.productGalleryImage}
          contentFit="contain"
          cachePolicy="memory-disk"
          onLoadStart={() => {
            if (!loadedProductImageUris.has(image.previewUrl) && !failedProductImageUris.has(image.previewUrl)) {
              setLoading(true);
            }
          }}
          onLoad={handleImageLoaded}
          onLoadEnd={() => setLoading(false)}
          onError={handleImageError}
        />
      ) : (
        <View style={styles.productGalleryEmpty}>
          <MaterialCommunityIcons name="image-broken-variant" size={42} color="#94A3B8" />
          <Text style={styles.productGalleryEmptyText}>Изображение не загрузилось</Text>
        </View>
      )}
      {loading && !failed ? (
        <View pointerEvents="none" style={styles.productGalleryLoader}>
          <ActivityIndicator size={28} color="#2563EB" />
        </View>
      ) : null}
    </View>
  );
}


const galleryStyles = StyleSheet.create({
  flatPressed: { opacity: 0.78 },
  productGalleryOverlay: { ...StyleSheet.absoluteFill, zIndex: 80, elevation: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1220' },
  productGalleryBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0B1220' },
  productGalleryCard: { maxWidth: '100%', maxHeight: '100%', borderRadius: 0, borderWidth: 0, backgroundColor: '#0B1220', overflow: 'hidden' },
  productGalleryHeader: { position: 'absolute', left: 10, right: 10, zIndex: 3, minHeight: 50, paddingLeft: 13, paddingRight: 7, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(15, 23, 42, 0.82)', flexDirection: 'row', alignItems: 'center', gap: 10 },
  productGalleryTitleWrap: { flex: 1, minWidth: 0 },
  productGalleryTitle: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  productGallerySubtitle: { marginTop: 1, color: '#CBD5E1', fontSize: 11, lineHeight: 14, fontWeight: '800' },
  productGalleryHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  productGalleryCounter: { minWidth: 38, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '900', textAlign: 'center' },
  productGalleryCloseButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  productGallerySlide: { position: 'relative', backgroundColor: '#0B1220', alignItems: 'center', justifyContent: 'center' },
  productGalleryImage: { ...StyleSheet.absoluteFill },
  productGalleryLoader: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11, 18, 32, 0.66)' },
  productGalleryEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  productGalleryEmptyText: { color: '#64748B', fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center' },
  productGalleryThumbsScroll: { position: 'absolute', left: 0, right: 0, zIndex: 3, maxHeight: 70 },
  productGalleryThumbs: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderRadius: 16, backgroundColor: 'rgba(15, 23, 42, 0.72)' },
  productGalleryThumb: { width: 54, height: 54, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: '#FFFFFF', overflow: 'hidden' },
  productGalleryThumbActive: { borderColor: '#2563EB', borderWidth: 2 },
  productGalleryThumbImage: { width: '100%', height: '100%' },
});

