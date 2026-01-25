import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
};

export default function InfoModal({ visible, title, message, onClose }: Props) {
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const maxWidth = Math.min(560, Math.max(320, width - 24));
  const maxHeight = Math.max(240, height - insets.top - insets.bottom - 80);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
        },
        card: {
          width: '100%',
          borderRadius: 18,
          padding: 14,
          backgroundColor: colors.cardBackground,
          borderWidth: 1,
          borderColor: colors.inputBorder,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        },
        title: { fontSize: 16, fontWeight: '800', color: colors.text, flex: 1 },
        closeBtn: {
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.inputBorder,
          backgroundColor: colors.inputBackground,
        },
        body: {
          paddingTop: 10,
          paddingBottom: 12,
        },
        message: { color: colors.text, fontSize: 14, lineHeight: 20 },
        actionBtn: {
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          paddingVertical: 12,
        },
        actionText: { color: '#fff', fontWeight: '700' },
      }),
    [colors]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={[styles.card, { maxWidth, maxHeight, marginTop: insets.top + 12, marginBottom: insets.bottom + 12 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close-outline" size={20} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.message}>{message}</Text>
          </ScrollView>
          <Pressable style={[styles.actionBtn, { backgroundColor: colors.tint }]} onPress={onClose}>
            <Text style={styles.actionText}>Понятно</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
