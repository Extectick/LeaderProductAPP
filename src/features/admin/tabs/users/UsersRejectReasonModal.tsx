import type { AdminUsersListItem } from '@/utils/userService';
import React from 'react';
import { Button, Dialog, Portal, Text, TextInput } from 'react-native-paper';
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
  target,
  reason,
  onChangeReason,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onClose}>
        <Dialog.Title>Причина отклонения</Dialog.Title>
        <Dialog.Content>
          {target ? <Text variant="bodyMedium">{nameOf(target)}</Text> : null}
          <TextInput
            mode="outlined"
            value={reason}
            onChangeText={onChangeReason}
            label="Причина"
            placeholder="Укажите причину, если нужно"
            multiline
            style={{ marginTop: 12, minHeight: 90 }}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onClose}>Отмена</Button>
          <Button mode="contained" buttonColor="#DC2626" onPress={onConfirm}>
            Далее
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
