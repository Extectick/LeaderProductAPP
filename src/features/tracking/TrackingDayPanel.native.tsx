import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import TrackingDayPanelHeader from './TrackingDayPanelHeader';
import type { TrackingDayPanelProps } from './TrackingDayPanel.types';

export default function TrackingDayPanel({ children, summary, expanded, onExpandedChange, bottomInset }: TrackingDayPanelProps) {
  const sheet = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => [64 + bottomInset, '68%'], [bottomInset]);
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
    <TrackingDayPanelHeader summary={summary} expanded={expanded} onPress={() => onExpandedChange(!expanded)} />
  ), [expanded, onExpandedChange, summary]);
  return (
    <BottomSheet ref={sheet} index={0} snapPoints={snapPoints} enableDynamicSizing={false} enablePanDownToClose={false} animateOnMount={false} topInset={8} handleComponent={handle} onChange={(index) => onExpandedChange(index > 0)} backgroundStyle={styles.background} style={styles.shadow}>
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 24 }]}>
        {children}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  shadow: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 8 },
  content: { paddingHorizontal: 16 },
});
