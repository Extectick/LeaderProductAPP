// V:\lp\components\CustomAlert.tsx
import React, { useCallback, useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import RNModal from 'react-native-modal';
import { useThemeColor } from '@/hooks/useThemeColor';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
  const btnText = useThemeColor({}, 'buttonText');
  const cancel  = useThemeColor({}, 'buttonDisabled');
  const confirm = useThemeColor({}, 'button');

  const cancelColor = useMemo(() => String(cancel), [cancel]);
  const confirmColor = useMemo(() => String(confirm), [confirm]);
  const textColor = useMemo(() => String(btnText), [btnText]);

  return (
    <RNModal
      isVisible={visible}
      // Критично: полное покрытие экрана без внешних отступов
      coverScreen
      style={styles.modal}        // margin:0
      // Закрытия
      onBackdropPress={onCancel}
      onBackButtonPress={onCancel}
      // Анимации
      useNativeDriver
      useNativeDriverForBackdrop
      backdropOpacity={0.35}
      animationIn="zoomIn"
      animationOut="zoomOut"
      backdropTransitionInTiming={180}
      backdropTransitionOutTiming={0}
      statusBarTranslucent
      avoidKeyboard={false}
    >
      <View style={styles.center}>
        <View style={[styles.card, { backgroundColor: bg }]}>
          <Text style={[styles.title,   { color: text }]}>{title}</Text>
          <Text style={[styles.message, { color: text }]}>{message}</Text>

          <View style={styles.buttonsRow}>
            <AnimatedActionButton
              label={cancelText}
              onPress={onCancel}
              baseColor={cancelColor}
              textColor={textColor}
              style={styles.buttonLeft}
            />

            <AnimatedActionButton
              label={confirmText}
              onPress={onConfirm}
              baseColor={confirmColor}
              textColor={textColor}
              style={styles.buttonRight}
            />
          </View>
        </View>
      </View>
    </RNModal>
  );
}

function hexToRgb(hex: string) {
  const cleaned = hex.trim().replace('#', '');
  if (cleaned.length !== 3 && cleaned.length !== 6) return null;
  const full = cleaned.length === 3
    ? cleaned.split('').map((c) => c + c).join('')
    : cleaned;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function mixHex(base: string, mixWith: string, amount: number) {
  const b = hexToRgb(base);
  const m = hexToRgb(mixWith);
  if (!b || !m) return base;
  const r = Math.round(b.r + (m.r - b.r) * amount);
  const g = Math.round(b.g + (m.g - b.g) * amount);
  const b2 = Math.round(b.b + (m.b - b.b) * amount);
  return `rgb(${r}, ${g}, ${b2})`;
}

function AnimatedActionButton({
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
  const hoverColor = useMemo(() => mixHex(baseColor, '#ffffff', 0.12), [baseColor]);
  const pressColor = useMemo(() => mixHex(baseColor, '#000000', 0.12), [baseColor]);

  const scale = useSharedValue(1);
  const bg = useSharedValue(0);
  const hoveredRef = useRef(false);
  const pressedRef = useRef(false);

  const animateTo = useCallback((state: 'idle' | 'hover' | 'press') => {
    if (state === 'press') {
      scale.value = withTiming(0.96, { duration: 120 });
      bg.value = withTiming(2, { duration: 120 });
      return;
    }
    if (state === 'hover') {
      scale.value = withTiming(1.03, { duration: 140 });
      bg.value = withTiming(1, { duration: 140 });
      return;
    }
    scale.value = withTiming(1, { duration: 160 });
    bg.value = withTiming(0, { duration: 160 });
  }, [bg, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(bg.value, [0, 1, 2], [baseColor, hoverColor, pressColor]),
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressedRef.current = true;
        animateTo('press');
      }}
      onPressOut={() => {
        pressedRef.current = false;
        animateTo(hoveredRef.current ? 'hover' : 'idle');
      }}
      onHoverIn={() => {
        hoveredRef.current = true;
        if (!pressedRef.current) animateTo('hover');
      }}
      onHoverOut={() => {
        hoveredRef.current = false;
        if (!pressedRef.current) animateTo('idle');
      }}
      style={{ flex: 1 }}
    >
      <Animated.View style={[styles.button, animatedStyle, style]}>
        <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
      </Animated.View>
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
  button: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', minWidth: 100 },
  buttonLeft:  { marginRight: 8 },
  buttonRight: { marginLeft: 8 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
