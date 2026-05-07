import React from 'react';
import { Button, Dialog, Portal, Text } from 'react-native-paper';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  dismissLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
};

export default function AdminPaperConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Подтвердить',
  dismissLabel = 'Отмена',
  destructive,
  loading,
  onDismiss,
  onConfirm,
}: Props) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={loading ? undefined : onDismiss}>
        <Dialog.Title>{title}</Dialog.Title>
        {message ? (
          <Dialog.Content>
            <Text variant="bodyMedium">{message}</Text>
          </Dialog.Content>
        ) : null}
        <Dialog.Actions>
          <Button disabled={loading} onPress={onDismiss}>{dismissLabel}</Button>
          <Button
            mode="contained"
            buttonColor={destructive ? '#DC2626' : undefined}
            loading={loading}
            disabled={loading}
            onPress={onConfirm}
          >
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
