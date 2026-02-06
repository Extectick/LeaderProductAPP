// V:\lp\components\CustomAlert.tsx
import React, { useCallback, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';
import RNModal from 'react-native-modal';
import { useThemeColor } from '@/hooks/useThemeColor';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelText?: string;
  confirmText?: string;
}

export default function CustomAlert({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
  cancelText = 'Отмена',
  confirmText = 'Выйти',
}: Props) {
  const bg      = useThemeColor({}, 'cardBackground');
  const text    = useThemeColor({}, 'text');
  const cancel  = useThemeColor({}, 'buttonDisabled');
  const confirm = useThemeColor({}, 'button');

  const cancelColor = useMemo(() => String(cancel), [cancel]);
  const confirmColor = useMemo(() => String(confirm), [confirm]);
  const readableText = useCallback((bg: string) => {
    const rgb = parseColor(bg);
    if (!rgb) return '#111827';
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.6 ? '#111827' : '#FFFFFF';
  }, []);

  const cancelTextColor = useMemo(() => readableText(cancelColor), [cancelColor, readableText]);
  const confirmTextColor = useMemo(() => readableText(confirmColor), [confirmColor, readableText]);

  return (
    <RNModal
      isVisible={visible}
      coverScreen
      style={styles.modal}
      onBackButtonPress={onCancel}
      useNativeDriver={false}
      backdropOpacity={0}
      backdropColor="transparent"
      animationIn="fadeIn"
      animationOut="fadeOut"
      animationInTiming={160}
      animationOutTiming={140}
      statusBarTranslucent
      avoidKeyboard={false}
    >
      <View style={styles.center}>
        <Pressable style={styles.backdropPress} onPress={onCancel}>
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: visible ? 0.35 : 0 }}
            transition={{ type: 'timing', duration: 180 }}
            style={styles.backdrop}
          />
        </Pressable>
        <MotiView
          from={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.96 }}
          transition={{ type: 'timing', duration: 200 }}
          style={[styles.card, { backgroundColor: bg }]}
        >
          <Text style={[styles.title,   { color: text }]}>{title}</Text>
          <Text style={[styles.message, { color: text }]}>{message}</Text>

          <View style={styles.buttonsRow}>
            <AlertButton
              label={cancelText}
              onPress={onCancel}
              baseColor={cancelColor}
              textColor={cancelTextColor}
              style={styles.buttonLeft}
            />

            <AlertButton
              label={confirmText}
              onPress={onConfirm}
              baseColor={confirmColor}
              textColor={confirmTextColor}
              style={styles.buttonRight}
            />
          </View>
        </MotiView>
      </View>
    </RNModal>
  );
}

function parseColor(value: string) {
  const trimmed = value.trim();
  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const num = Number.parseInt(full, 16);
    if (Number.isNaN(num)) return null;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  const rgbMatch = trimmed.replace(/\s+/g, '').match(/^rgba?\((\d+),(\d+),(\d+)/i);
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
  }
  return null;
}

function AlertButton({
  label,
  onPress,
  baseColor,
  textColor,
  style,
}: {
  label: string;
  onPress: () => void;
  baseColor: string;
  textColor: string;
  style?: any;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      styles.button,
      { backgroundColor: baseColor, opacity: pressed ? 0.9 : 1 },
      style,
    ]}>
      <View style={styles.buttonContent}>
        <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Контейнер RNModal: убираем отступы и не используем его флекс-центрирование вовсе
  modal: {
    margin: 0,
  },
  // Отдельный слой-центрер, чтобы карточка точно оказалась в центре
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 10 },
      web: { boxShadow: '0 10px 30px rgba(0,0,0,0.25)' as any },
    }),
  },
  title:   { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  message: { fontSize: 16, textAlign: 'center' },
  buttonsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 10, minWidth: 100 },
  buttonContent: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  buttonLeft:  { marginRight: 8 },
  buttonRight: { marginLeft: 8 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
