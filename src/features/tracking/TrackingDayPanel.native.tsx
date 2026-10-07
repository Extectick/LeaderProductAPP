import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BackHandler, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import TrackingDayPanelHeader from './TrackingDayPanelHeader';
import type { TrackingDayPanelProps } from './TrackingDayPanel.types';

type HandleState = Omit<TrackingDayPanelProps, 'listProps' | 'onHeaderHeightChange'> & {
  onLayout: (event: LayoutChangeEvent) => void;
};
const HandleContext = createContext<HandleState | null>(null);

// BottomSheet treats handleComponent as a component type, not a render callback.
// Keep it stable: remounting on every data refresh invalidates native measurements.
function TrackingDayPanelHandle() {
  const state = useContext(HandleContext);
  if (!state) return null;
  const { summary, expanded, onExpandedChange, bottomInset, dateControls, navigation, onRefresh, refreshing, refreshDisabled, onLayout } = state;
  return (
    <View collapsable={false} style={[styles.handle, { paddingBottom: expanded ? 0 : bottomInset }]}>
      <TrackingDayPanelHeader summary={summary} expanded={expanded} onPress={() => onExpandedChange(!expanded)} dateControls={dateControls} navigation={navigation} onRefresh={onRefresh} refreshing={refreshing} refreshDisabled={refreshDisabled} onLayout={onLayout} />
    </View>
  );
}

export default function TrackingDayPanel({ listProps, summary, expanded, onExpandedChange, bottomInset, dateControls, navigation, onHeaderHeightChange, onRefresh, refreshing, refreshDisabled }: TrackingDayPanelProps) {
  const [headerHeight, setHeaderHeight] = useState(92);
  const snapPoints = useMemo(() => [headerHeight + bottomInset, '78%'], [headerHeight, bottomInset]);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.height);
    // A hidden/detaching screen can report zero; keep the last usable geometry.
    if (!Number.isFinite(next) || next <= 0) return;
    setHeaderHeight(next);
    onHeaderHeightChange?.(next);
  }, [onHeaderHeightChange]);
  const handleState = useMemo<HandleState>(() => ({
    summary, expanded, onExpandedChange, bottomInset, dateControls, navigation,
    onRefresh, refreshing, refreshDisabled, onLayout: handleLayout,
  }), [summary, expanded, onExpandedChange, bottomInset, dateControls, navigation, onRefresh, refreshing, refreshDisabled, handleLayout]);
  useEffect(() => {
    if (!expanded) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      onExpandedChange(false);
      return true;
    });
    return () => listener.remove();
  }, [expanded, onExpandedChange]);
  return (
    <HandleContext.Provider value={handleState}>
      <BottomSheet index={expanded ? 1 : 0} snapPoints={snapPoints} bottomInset={0} enableHandlePanningGesture={false} enableDynamicSizing={false} enablePanDownToClose={false} animateOnMount={false} topInset={8} handleComponent={TrackingDayPanelHandle} onChange={(index) => { if (index === 0 || index === 1) onExpandedChange(index === 1); }} backgroundStyle={styles.background} style={styles.shadow}>
        <BottomSheetFlatList {...listProps} contentContainerStyle={[listProps.contentContainerStyle, { paddingBottom: bottomInset + 12 }]} />
      </BottomSheet>
    </HandleContext.Provider>
  );
}

const styles = StyleSheet.create({
  handle: { flexShrink: 0 },
  background: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  shadow: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 8 },
});
