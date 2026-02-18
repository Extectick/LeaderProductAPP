import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { AdminUsersListItem } from '@/utils/userService';
import { nameOf } from './usersTab.helpers';

type Props = {
  visible: boolean;
  styles: any;
  colors: any;
  target: AdminUsersListItem | null;
  reason: string;
  onChangeReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function UsersRejectReasonModal({
  visible,
  styles,
  colors,
  target,
  reason,
  onChangeReason,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={[styles.modalCard, { maxWidth: 520 }]}>
          <Text style={styles.sectionTitle}>Причина отклонения</Text>
          <Text style={styles.sub}>{target ? nameOf(target) : ''}</Text>
          <TextInput
            value={reason}
            onChangeText={onChangeReason}
            placeholder="Укажите причину (опционально)"
            placeholderTextColor={colors.secondaryText}
            multiline
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Pressable onPress={onClose} style={styles.btn}>
              <Text style={styles.btnText}>Отмена</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={[styles.btn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.btnText, { color: '#991B1B' }]}>Далее</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
