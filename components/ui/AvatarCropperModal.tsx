import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as ImageManipulator from 'expo-image-manipulator';

type CropImage = {
  uri: string;
  width: number;
  height: number;
};

type Props = {
  visible: boolean;
  image: CropImage | null;
  onCancel: () => void;
  onConfirm: (result: CropImage) => void;
};

const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, value));
};

export default function AvatarCropperModal({ visible, image, onCancel, onConfirm }: Props) {
  const { width } = useWindowDimensions();
  const cropSize = Math.min(width * 0.72, 280);
  const [saving, setSaving] = useState(false);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);

  const baseScale = useMemo(() => {
    if (!image) return 1;
    return Math.max(cropSize / image.width, cropSize / image.height);
  }, [cropSize, image]);

  useEffect(() => {
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
  }, [image?.uri, scale, translateX, translateY]);

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      if (!image) return;
      const nextX = startX.value + e.translationX;
      const nextY = startY.value + e.translationY;
      const displayW = image.width * baseScale * scale.value;
      const displayH = image.height * baseScale * scale.value;
      const maxX = Math.max(0, (displayW - cropSize) / 2);
      const maxY = Math.max(0, (displayH - cropSize) / 2);
      translateX.value = clamp(nextX, -maxX, maxX);
      translateY.value = clamp(nextY, -maxY, maxY);
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      if (!image) return;
      const nextScale = clamp(startScale.value * e.scale, 1, 4);
      scale.value = nextScale;
      const displayW = image.width * baseScale * scale.value;
      const displayH = image.height * baseScale * scale.value;
      const maxX = Math.max(0, (displayW - cropSize) / 2);
      const maxY = Math.max(0, (displayH - cropSize) / 2);
      translateX.value = clamp(translateX.value, -maxX, maxX);
      translateY.value = clamp(translateY.value, -maxY, maxY);
    });

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: baseScale * scale.value },
    ],
  }));

  const handleConfirm = async () => {
    if (!image) return;
    setSaving(true);
    try {
      const totalScale = baseScale * scale.value;
      const displayW = image.width * totalScale;
      const displayH = image.height * totalScale;
      const left = cropSize / 2 - displayW / 2 + translateX.value;
      const top = cropSize / 2 - displayH / 2 + translateY.value;
      const cropW = Math.min(image.width, cropSize / totalScale);
      const cropH = Math.min(image.height, cropSize / totalScale);
      const originX = clamp(-left / totalScale, 0, Math.max(0, image.width - cropW));
      const originY = clamp(-top / totalScale, 0, Math.max(0, image.height - cropH));

      const result = await ImageManipulator.manipulateAsync(
        image.uri,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(cropW),
              height: Math.round(cropH),
            },
          },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      onConfirm({ uri: result.uri, width: result.width, height: result.height });
    } finally {
      setSaving(false);
    }
  };

  if (!image) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Аватар</Text>
          <Text style={styles.subtitle}>Передвиньте и приблизьте изображение</Text>

          <View style={[styles.cropWrap, { width: cropSize, height: cropSize }]}>
            <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
              <Animated.View style={styles.cropInner}>
                <Animated.Image
                  source={{ uri: image.uri }}
                  style={[{ width: image.width, height: image.height }, imageStyle]}
                  resizeMode="contain"
                />
              </Animated.View>
            </GestureDetector>
            <View pointerEvents="none" style={[styles.cropMask, { borderRadius: cropSize / 2 }]} />
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel} disabled={saving}>
              <Text style={styles.btnGhostText}>Отмена</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={handleConfirm} disabled={saving}>
              {saving ? (
                <View style={styles.btnBusy}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.btnPrimaryText}>Сохраняем…</Text>
                </View>
              ) : (
                <Text style={styles.btnPrimaryText}>Готово</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 20,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 12, color: '#475569', textAlign: 'center' },
  cropWrap: {
    marginTop: 10,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropMask: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    width: '100%',
    height: '100%',
  },
  actions: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: {
    backgroundColor: '#F1F5F9',
  },
  btnGhostText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  btnPrimary: {
    backgroundColor: '#0ea5e9',
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '800',
  },
  btnBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
