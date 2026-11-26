import React from 'react';
import { Portal, Snackbar } from 'react-native-paper';

type Props = { message: string; onDismiss: () => void };

export const OrderShareFeedback = React.memo(function OrderShareFeedback({ message, onDismiss }: Props) {
  if (!message) return null;

  return (
    <Portal>
      <Snackbar key={message} visible onDismiss={onDismiss} duration={5000} action={{ label: 'Закрыть', onPress: onDismiss }}>
        {message}
      </Snackbar>
    </Portal>
  );
});
