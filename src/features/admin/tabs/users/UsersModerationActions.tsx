import type { AdminUsersListItem } from '@/utils/userService';
import React from 'react';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';
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
          <Button
            compact
            mode="contained-tonal"
            icon="check-circle-outline"
            disabled={actionBusy}
            loading={actionBusy}
            onPress={onApprove}
          >
            Подтвердить
          </Button>
          <Button
            compact
            mode="contained-tonal"
            icon="close-circle-outline"
            textColor="#991B1B"
            disabled={actionBusy}
            onPress={onReject}
          >
            Отклонить
          </Button>
        </>
      ) : (
        <Text variant="bodySmall" style={styles.actionHint}>Модерация не требуется</Text>
      )}
      <Button compact mode="outlined" icon="pencil-outline" onPress={onEdit}>
        Редактировать
      </Button>
    </View>
  );
}
