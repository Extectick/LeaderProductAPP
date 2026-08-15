import React from 'react';
import { StyleSheet, View, type NativeSyntheticEvent, type ViewProps } from 'react-native';

export type PagerViewOnPageSelectedEvent = NativeSyntheticEvent<{ position: number }>;
export type PagerViewOnPageScrollEvent = NativeSyntheticEvent<{ position: number; offset: number }>;
export type PageScrollStateChangedNativeEventData = { pageScrollState: 'idle' | 'dragging' | 'settling' };
export type CounterpartyPagerRef = { setPage: (page: number) => void; setPageWithoutAnimation: (page: number) => void };

type Props = ViewProps & {
  initialPage?: number;
  onPageSelected?: (event: PagerViewOnPageSelectedEvent) => void;
  onPageScroll?: (event: PagerViewOnPageScrollEvent) => void;
  onPageScrollStateChanged?: (event: NativeSyntheticEvent<PageScrollStateChangedNativeEventData>) => void;
  children?: React.ReactNode;
  orientation?: 'horizontal' | 'vertical';
  pageMargin?: number;
  offscreenPageLimit?: number;
  overScrollMode?: 'auto' | 'always' | 'never';
  keyboardDismissMode?: 'none' | 'on-drag';
};

const CounterpartyPager = React.forwardRef<CounterpartyPagerRef, Props>(function CounterpartyPager(
  {
    initialPage = 0,
    onPageSelected,
    onPageScroll: _onPageScroll,
    onPageScrollStateChanged: _onPageScrollStateChanged,
    children,
    orientation: _orientation,
    pageMargin: _pageMargin,
    offscreenPageLimit: _offscreenPageLimit,
    overScrollMode: _overScrollMode,
    keyboardDismissMode: _keyboardDismissMode,
    ...props
  },
  ref
) {
  const pages = React.Children.toArray(children);
  const [selected, setSelected] = React.useState(initialPage);
  const select = React.useCallback((page: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, Math.trunc(page)));
    setSelected(next);
    onPageSelected?.({ nativeEvent: { position: next } } as PagerViewOnPageSelectedEvent);
  }, [onPageSelected, pages.length]);
  React.useImperativeHandle(ref, () => ({ setPage: select, setPageWithoutAnimation: select }), [select]);
  return (
    <View {...props}>
      {pages.map((page, index) => <View key={index} style={[styles.page, selected !== index && styles.hidden]}>{page}</View>)}
    </View>
  );
});

const styles = StyleSheet.create({ page: { flex: 1 }, hidden: { display: 'none' } });
export default CounterpartyPager;
