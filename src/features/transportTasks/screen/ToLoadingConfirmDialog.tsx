import React from 'react';
import { Button, Dialog, Text } from 'react-native-paper';
import { styles } from './styles';

type Props = {
  visible: boolean;
  loading: boolean;
  hasRouteOrderChanges: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
};

export default function ToLoadingConfirmDialog({
  visible,
  loading,
  hasRouteOrderChanges,
  onDismiss,
  onConfirm,
}: Props) {
  return (
    <Dialog visible={visible} onDismiss={loading ? undefined : onDismiss} style={styles.toLoadingDialog}>
      <Dialog.Icon icon="truck-fast-outline" color="#F97316" />
      <Dialog.Title style={styles.toLoadingDialogTitle}>Передать к погрузке?</Dialog.Title>
      <Dialog.Content style={styles.toLoadingDialogContent}>
        <Text variant="bodyMedium" style={styles.toLoadingDialogText}>
          {hasRouteOrderChanges
            ? 'Текущий порядок маршрута будет применен, документ перейдет в статус "К погрузке" и будет проведен.'
            : 'Документ перейдет в статус "К погрузке" и будет проведен. После этого маршрут нельзя будет редактировать.'}
        </Text>
        <Text variant="bodySmall" style={styles.toLoadingDialogWarning}>
          После отправки вернуть документ обратно сможет только администратор.
        </Text>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss} disabled={loading}>
          Отмена
        </Button>
        <Button
          mode="contained"
          icon="truck-fast-outline"
          buttonColor="#F97316"
          textColor="#FFFFFF"
          onPress={onConfirm}
          loading={loading}
          disabled={loading}
        >
          К погрузке
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}
