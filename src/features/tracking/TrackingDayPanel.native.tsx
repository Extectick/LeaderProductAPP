import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import TrackingDayPanelHeader from './TrackingDayPanelHeader';
import type { TrackingDayPanelProps } from './TrackingDayPanel.types';

export default function TrackingDayPanel({ listProps, summary, expanded, onExpandedChange, bottomInset, dateControls, onRefresh, refreshing, refreshDisabled }: TrackingDayPanelProps) {
  const sheet = useRef<BottomSheet>(null);
  const [headerHeight, setHeaderHeight] = useState(92);
  const snapPoints = useMemo(() => [headerHeight + bottomInset, '78%'], [headerHeight, bottomInset]);
  useEffect(() => { sheet.current?.snapToIndex(expanded ? 1 : 0); }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      onExpandedChange(false);
      return true;
    });
    return () => listener.remove();
  }, [expanded, onExpandedChange]);
  const handle = useCallback(() => (
    <View style={{ paddingBottom: expanded ? 0 : bottomInset }}>
      <TrackingDayPanelHeader summary={summary} expanded={expanded} onPress={() => onExpandedChange(!expanded)} dateControls={dateControls} onRefresh={onRefresh} refreshing={refreshing} refreshDisabled={refreshDisabled} onLayout={(event) => setHeaderHeight(Math.ceil(event.nativeEvent.layout.height))} />
    </View>
  ), [expanded, onExpandedChange, summary, bottomInset, dateControls, onRefresh, refreshing, refreshDisabled]);
  return (
    <BottomSheet ref={sheet} index={0} snapPoints={snapPoints} bottomInset={0} enableHandlePanningGesture={false} enableDynamicSizing={false} enablePanDownToClose={false} animateOnMount={false} topInset={8} handleComponent={handle} onChange={(index) => onExpandedChange(index > 0)} backgroundStyle={styles.background} style={styles.shadow}>
      <BottomSheetFlatList {...listProps} contentContainerStyle={[listProps.contentContainerStyle, { paddingBottom: bottomInset + 12 }]} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  shadow: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 8 },
});
