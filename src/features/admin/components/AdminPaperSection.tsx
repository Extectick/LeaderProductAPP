import React from 'react';
import { Card, Text } from 'react-native-paper';
import { styles } from '../screen/styles';

type Props = {
  title?: string;
  children: React.ReactNode;
};

export default function AdminPaperSection({ title, children }: Props) {
  return (
    <Card mode="outlined" style={styles.sectionCard}>
      <Card.Content style={styles.sectionContent}>
        {title ? <Text variant="titleMedium">{title}</Text> : null}
        {children}
      </Card.Content>
    </Card>
  );
}
