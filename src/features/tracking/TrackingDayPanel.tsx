import React, { useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { Surface } from 'react-native-paper';
import TrackingDayPanelHeader from './TrackingDayPanelHeader';
import type { TrackingDayPanelProps } from './TrackingDayPanel.types';

export default function TrackingDayPanel({ listProps, summary, expanded, onExpandedChange, bottomInset, dateControls, onRefresh, refreshing, refreshDisabled }: TrackingDayPanelProps) {
  const [headerHeight, setHeaderHeight] = useState(92);
  return (
    <Surface elevation={2} style={[styles.panel, { height: expanded ? '78%' : headerHeight + bottomInset }]}>
      <TrackingDayPanelHeader summary={summary} expanded={expanded} onPress={() => onExpandedChange(!expanded)} dateControls={dateControls} onRefresh={onRefresh} refreshing={refreshing} refreshDisabled={refreshDisabled} onLayout={(event) => setHeaderHeight(Math.ceil(event.nativeEvent.layout.height))} />
      {expanded ? <FlatList {...listProps} contentContainerStyle={[listProps.contentContainerStyle, { paddingBottom: bottomInset + 12 }]} /> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '90%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#FFFFFF', overflow: 'hidden' },
});
