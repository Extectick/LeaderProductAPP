import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useThemeColor } from '../hooks/useThemeColor';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelText?: string;
  confirmText?: string;
}

const { width, height } = Dimensions.get('window');

export default function CustomAlert({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
  cancelText = 'Отмена',
  confirmText = 'Выйти',
}: CustomAlertProps) {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  const backgroundColor = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const buttonTextColor = useThemeColor({}, 'buttonText');
  const cancelColor = useThemeColor({}, 'buttonDisabled');
  const confirmColor = useThemeColor({}, 'button');

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none">
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Animated.View
          style={[
            styles.alertContainer,
            {
              backgroundColor,
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Text style={[styles.title, { color: textColor }]}>{title}</Text>
          <Text style={[styles.message, { color: textColor }]}>{message}</Text>

          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: cancelColor }]}
              onPress={onCancel}
            >
              <Text style={[styles.buttonText, { color: buttonTextColor }]}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: confirmColor }]}
              onPress={onConfirm}
            >
              <Text style={[styles.buttonText, { color: buttonTextColor }]}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContainer: {
    width: width * 0.85,
    borderRadius: 16,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 100,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
