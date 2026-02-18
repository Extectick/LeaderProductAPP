import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { AdminUsersListItem } from '@/utils/userService';
import { needsModeration } from './usersTab.helpers';

type Props = {
  item: AdminUsersListItem;
  styles: any;
  actionBusy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
};

export function UsersModerationActions({
  item,
  styles,
  actionBusy,
  onApprove,
  onReject,
  onEdit,
}: Props) {
  return (
    <View style={styles.actions}>
      {needsModeration(item) ? (
        <>
          <Pressable
            disabled={actionBusy}
            onPress={onApprove}
            style={[styles.btn, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }, actionBusy && { opacity: 0.6 }]}
          >
            <Text style={[styles.btnText, { color: '#166534' }]}>Подтвердить</Text>
          </Pressable>
          <Pressable
            disabled={actionBusy}
            onPress={onReject}
            style={[styles.btn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }, actionBusy && { opacity: 0.6 }]}
          >
            <Text style={[styles.btnText, { color: '#991B1B' }]}>Отклонить</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.actionHint}>Модерация не требуется</Text>
      )}
      <Pressable onPress={onEdit} style={styles.btn}>
        <Text style={styles.btnText}>Редактировать</Text>
      </Pressable>
    </View>
  );
}
