import React from 'react';
import {Animated, Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import PagerView, {type ClientOrdersPagerRef, type PagerViewOnPageSelectedEvent} from '../clientOrders/ClientOrdersPager';
import {STOCK_TABS, stockSwipeTarget, type StockTab} from './stockTabs';
import {StockSwipeRefContext} from './StockGestureLists';

const AnimatedPager = Animated.createAnimatedComponent(PagerView);
export function StockTabsPager({value, onChange, enabled = true, tabsAccessory, children}: React.PropsWithChildren<{
  value: StockTab; onChange: (tab: StockTab) => void; enabled?: boolean; tabsAccessory?: React.ReactNode;
}>) {
  const ref = React.useRef<ClientOrdersPagerRef | null>(null);
  const swipeRef = React.useRef<any>(undefined);
  const target = React.useRef(STOCK_TABS.findIndex(tab => tab.value === value));
  const position = React.useRef(new Animated.Value(target.current)).current;
  const offset = React.useRef(new Animated.Value(0)).current;
  const progress = React.useMemo(() => Animated.add(position, offset), [position, offset]);
  const [width, setWidth] = React.useState(0);
  const onScroll = React.useMemo(() => Animated.event([{nativeEvent: {position, offset}}], {useNativeDriver: true}), [position, offset]);
  const select = React.useCallback((page: number) => {
    if (!enabled || page === target.current) return;
    target.current = page;
    // Native setPage animates; defer expensive tab state/query changes until selection.
    if (ref.current) ref.current.setPage(page);
    else onChange(STOCK_TABS[page].value);
  }, [enabled, onChange]);
  const selected = React.useCallback((event: PagerViewOnPageSelectedEvent) => {
    const page = Math.max(0, Math.min(STOCK_TABS.length - 1, event.nativeEvent.position));
    target.current = page; position.setValue(page); offset.setValue(0);
    onChange(STOCK_TABS[page].value);
  }, [position, offset, onChange]);
  React.useEffect(() => {
    const page = STOCK_TABS.findIndex(tab => tab.value === value);
    if (page !== target.current) {
      target.current = page; position.setValue(page); offset.setValue(0);
      ref.current?.setPageWithoutAnimation(page);
    }
  }, [value, position, offset]);
  const gesture = React.useMemo(() => Gesture.Pan().withRef(swipeRef).enabled(enabled)
    .activeOffsetX([-12, 12]).failOffsetY([-18, 18])
    .onEnd(event => select(stockSwipeTarget(target.current, event))).runOnJS(true), [enabled, select]);
  const step = width / STOCK_TABS.length;
  return <GestureHandlerRootView style={styles.root}>
    <View style={styles.tabsRow}>
      <View style={styles.tabs} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? <Animated.View pointerEvents="none" style={[styles.indicator, {width: step,
          transform: [{translateX: progress.interpolate({inputRange: [0, 1, 2], outputRange: [0, step, step * 2], extrapolate: 'clamp'})}]}]} /> : null}
        {STOCK_TABS.map((tab, index) => <Pressable key={tab.value} accessibilityRole="tab" accessibilityLabel={tab.label}
          accessibilityState={{selected: value === tab.value}} onPress={() => select(index)} style={styles.tab}>
          <Text style={[styles.label, value === tab.value && styles.selectedLabel]}>{tab.label}</Text>
        </Pressable>)}
      </View>{tabsAccessory}
    </View>
    <StockSwipeRefContext.Provider value={swipeRef}><GestureDetector gesture={gesture}>
      <AnimatedPager ref={ref as any} testID="stock-tabs-pager" style={styles.root} initialPage={target.current}
        orientation="horizontal" layoutDirection="ltr" pageMargin={0} offscreenPageLimit={1} overScrollMode="never"
        keyboardDismissMode="on-drag" scrollEnabled={false} onPageScroll={onScroll} onPageSelected={selected}>
        {STOCK_TABS.map((tab, index) => <View key={tab.value} collapsable={false} style={styles.root}
          pointerEvents={value === tab.value ? 'auto' : 'none'} accessibilityElementsHidden={value !== tab.value}
          importantForAccessibility={value === tab.value ? 'auto' : 'no-hide-descendants'}>{React.Children.toArray(children)[index]}</View>)}
      </AnimatedPager>
    </GestureDetector></StockSwipeRefContext.Provider>
  </GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  root: {flex: 1, minHeight: 0},
  tabsRow: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderColor: '#E2E8F0'},
  tabs: {flex: 1, flexDirection: 'row', borderRadius: 10, backgroundColor: '#F1F5F9', overflow: 'hidden'},
  indicator: {position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 10, backgroundColor: '#DBEAFE'},
  tab: {flex: 1, minHeight: 36, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center'},
  label: {fontSize: 11, fontWeight: '600', color: '#64748B'},
  selectedLabel: {color: '#2563EB'},
});
