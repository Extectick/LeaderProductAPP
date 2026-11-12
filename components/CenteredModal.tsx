import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Dimensions, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import {APP_LAYOUT} from '@/src/shared/layout/appLayout';
import {AppDesktopDialog} from './ui/AppDesktopDialog';

interface Props {
  visible: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}

const { width } = Dimensions.get('window');

export default function CenteredModal({ visible, onClose, children }: Props) {
  const {width:viewportWidth}=useWindowDimensions();
  if(Platform.OS==='web'&&viewportWidth>APP_LAYOUT.compactMax)return <AppDesktopDialog visible={visible} onClose={onClose} accessibilityLabel="Диалог" maxWidth={560} contentStyle={{alignItems:'center'}} testID="centered-modal-dialog">{children}</AppDesktopDialog>;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)', // затемнение фона
    justifyContent: 'center',          // вертикальное центрирование
    alignItems: 'center',              // горизонтальное центрирование
  },
  modalContainer: {
    width: width * 0.85,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'red',
    borderRadius: 20,
    padding: 6,
    zIndex: 10,
  },
});
