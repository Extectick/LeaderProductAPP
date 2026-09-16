import React from 'react';
import { StyleSheet, View } from 'react-native';
import { List } from 'react-native-paper';

export default function TrackingDayPanelHeader({ summary, expanded, onPress }: {
  summary: string;
  expanded: boolean;
  onPress: () => void;
}) {
  return (
    <View>
      <View style={styles.handle} />
      <List.Item title="Итоги дня" description={summary} descriptionNumberOfLines={1} accessibilityRole="button" accessibilityLabel={expanded ? 'Свернуть итоги дня' : 'Открыть итоги дня и хронологию'} accessibilityState={{ expanded }} onPress={onPress} style={styles.header} titleStyle={styles.title} descriptionStyle={styles.summary} left={(props) => <List.Icon {...props} icon="chart-timeline-variant" color="#2563EB" />} right={(props) => <List.Icon {...props} icon={expanded ? 'chevron-down' : 'chevron-up'} />} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 54, paddingVertical: 0, paddingRight: 8 },
  handle: { width: 32, height: 3, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginTop: 7 },
  title: { fontSize: 14, lineHeight: 18, fontWeight: '800', color: '#0F172A' },
  summary: { fontSize: 12, lineHeight: 17, color: '#64748B' },
});
