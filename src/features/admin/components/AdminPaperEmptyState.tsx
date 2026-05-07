import React from 'react';
import { View } from 'react-native';
import { Button, List, Text } from 'react-native-paper';
import { styles } from '../screen/styles';

type Props = {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function AdminPaperEmptyState({
  icon = 'information-outline',
  title,
  message,
  actionLabel,
  onAction,
}: Props) {
  return (
    <View style={styles.emptyState}>
      <List.Icon icon={icon} />
      <Text variant="titleMedium">{title}</Text>
      {message ? <Text variant="bodyMedium" style={styles.mutedText}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button mode="outlined" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}
