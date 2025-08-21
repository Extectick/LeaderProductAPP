// V:\lp\components\CustomAlert.tsx
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const btnText = useThemeColor({}, 'buttonText');
  const cancel  = useThemeColor({}, 'buttonDisabled');
  const confirm = useThemeColor({}, 'button');

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
      backdropOpacity={0}         // сам нарисуем подложку, чтобы не было конфликтов слоёв
      animationIn="zoomIn"
      animationOut="zoomOut"
      backdropTransitionOutTiming={0}
      statusBarTranslucent
      avoidKeyboard={false}
    >
      {/* Наш собственный фулл-скрин слой — не зависит от флекса RNModal */}
      <View style={styles.root} pointerEvents="box-none">
        {/* Подложка */}
        <Pressable style={styles.backdrop} onPress={onCancel} />

        {/* Центрирующая обёртка */}
        <View style={styles.center}>
          <View style={[styles.card, { backgroundColor: bg }]}>
            <Text style={[styles.title,   { color: text }]}>{title}</Text>
            <Text style={[styles.message, { color: text }]}>{message}</Text>

            <View style={styles.buttonsRow}>
              <TouchableOpacity
                style={[styles.button, styles.buttonLeft,  { backgroundColor: cancel }]}
                onPress={onCancel}
                activeOpacity={0.85}
              >
                <Text style={[styles.buttonText, { color: btnText }]}>{cancelText}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.buttonRight, { backgroundColor: confirm }]}
                onPress={onConfirm}
                activeOpacity={0.85}
              >
                <Text style={[styles.buttonText, { color: btnText }]}>{confirmText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  // Контейнер RNModal: убираем отступы и не используем его флекс-центрирование вовсе
  modal: {
    margin: 0,
  },
  // Наш фулл-скрин слой
  root: {
    ...StyleSheet.absoluteFillObject, // всегда во весь экран на iOS/Android
    // Для web (на всякий): зафиксировать окно
    ...Platform.select({ web: { position: 'fixed' as any, inset: 0 } }),
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
