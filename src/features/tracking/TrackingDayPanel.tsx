import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Surface } from 'react-native-paper';
import TrackingDayPanelHeader from './TrackingDayPanelHeader';
import type { TrackingDayPanelProps } from './TrackingDayPanel.types';

export default function TrackingDayPanel({ children, summary, expanded, onExpandedChange, bottomInset }: TrackingDayPanelProps) {
  return (
    <Surface elevation={2} style={[styles.panel, { height: expanded ? '68%' : 64 + bottomInset }]}>
      <TrackingDayPanelHeader summary={summary} expanded={expanded} onPress={() => onExpandedChange(!expanded)} />
      {expanded ? <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 24 }}>{children}</ScrollView> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '90%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#FFFFFF', overflow: 'hidden' },
});
