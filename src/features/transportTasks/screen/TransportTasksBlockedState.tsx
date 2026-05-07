import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import React from 'react';
import { ScrollView } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { styles } from './styles';

type Props = {
  background: string;
  topInset: number;
  employeeProfileExists: boolean;
  error: string | null;
  profileLoading: boolean;
  onRefreshProfile: () => void;
};

export default function TransportTasksBlockedState({
  background,
  topInset,
  employeeProfileExists,
  error,
  profileLoading,
  onRefreshProfile,
}: Props) {
  return (
    <ScrollView
      style={[styles.root, { backgroundColor: background }]}
      contentContainerStyle={[styles.blockedContent, { paddingTop: topInset + 12 }]}
    >
      <Card mode="outlined" style={styles.blockedCard}>
        <Card.Content style={styles.blockedInner}>
          <Text variant="titleLarge" style={styles.blockedTitle}>
            {!employeeProfileExists
              ? 'Профиль сотрудника не найден'
              : 'Профиль не сопоставлен с пользователем 1С'}
          </Text>
          <Text variant="bodyMedium" style={styles.mutedText}>
            {!employeeProfileExists
              ? 'Для работы с заданиями на перевозку нужен активный профиль сотрудника.'
              : 'Профиль не сопоставлен с пользователем 1С. Обратитесь к администратору.'}
          </Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button
            mode="outlined"
            onPress={onRefreshProfile}
            loading={profileLoading}
            disabled={profileLoading}
          >
            Обновить профиль
          </Button>
        </Card.Content>
      </Card>
      <TabBarSpacer />
    </ScrollView>
  );
}
