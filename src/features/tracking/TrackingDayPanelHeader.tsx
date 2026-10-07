import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { IconButton, Text, TouchableRipple } from 'react-native-paper';

export default function TrackingDayPanelHeader({ summary, expanded, onPress, dateControls, navigation, onRefresh, refreshing, refreshDisabled, onLayout }: {
  summary: string;
  expanded: boolean;
  onPress?: () => void;
  dateControls: React.ReactNode;
  navigation?: React.ReactNode;
  onRefresh: () => void;
  refreshing: boolean;
  refreshDisabled: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View onLayout={onLayout}>
      <View style={styles.header}>
        <TouchableRipple disabled={!onPress} accessibilityRole="button" accessibilityLabel={expanded ? 'Свернуть итоги дня' : 'Открыть итоги дня и хронологию'} accessibilityState={{ expanded }} onPress={onPress} style={styles.titleButton}>
          <View><Text style={styles.title}>Итоги дня</Text><Text style={styles.summary} numberOfLines={1}>{summary}</Text></View>
        </TouchableRipple>
        <IconButton icon="refresh" size={21} loading={refreshing} disabled={refreshDisabled || refreshing} accessibilityLabel="Обновить маршрут и события" onPress={onRefresh} style={styles.action} />
        {onPress ? <IconButton icon={expanded ? 'chevron-down' : 'chevron-up'} size={24} accessibilityLabel={expanded ? 'Свернуть список событий' : 'Развернуть список событий'} onPress={onPress} style={styles.action} /> : null}
      </View>
      {dateControls}
      {navigation}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4 },
  titleButton: { flex: 1, minWidth: 0, minHeight: 50, justifyContent: 'center' },
  action: { width: 42, height: 44, margin: 0 },
  title: { fontSize: 14, lineHeight: 18, fontWeight: '800', color: '#0F172A' },
  summary: { fontSize: 12, lineHeight: 17, color: '#64748B' },
});
