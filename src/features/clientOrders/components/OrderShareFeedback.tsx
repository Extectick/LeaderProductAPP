import React from 'react';
import { Portal, Snackbar } from 'react-native-paper';

export function OrderShareFeedback({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <Portal><Snackbar visible={!!message} onDismiss={onDismiss} duration={5000} action={{ label: 'Закрыть', onPress: onDismiss }}>{message}</Snackbar></Portal>;
}
