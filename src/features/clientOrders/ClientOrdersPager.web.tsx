import React from 'react';
import {
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';

export type PagerViewOnPageSelectedEvent = NativeSyntheticEvent<{ position: number }>;

export type ClientOrdersPagerRef = {
  setPage: (page: number) => void;
  setPageWithoutAnimation: (page: number) => void;
};

type PageScrollEvent = NativeSyntheticEvent<{ position: number; offset: number }>;

type Props = ViewProps & {
  initialPage?: number;
  onPageSelected?: (event: PagerViewOnPageSelectedEvent) => void;
  onPageScroll?: (event: PageScrollEvent) => void;
  children?: React.ReactNode;
  orientation?: 'horizontal' | 'vertical';
  layoutDirection?: 'ltr' | 'rtl' | 'locale';
  pageMargin?: number;
  offscreenPageLimit?: number;
  overScrollMode?: 'auto' | 'always' | 'never';
  keyboardDismissMode?: 'none' | 'on-drag';
  scrollEnabled?: boolean;
};

const ClientOrdersPager = React.forwardRef<ClientOrdersPagerRef, Props>(function ClientOrdersPager(
  {
    initialPage = 0,
    onPageSelected,
    onPageScroll,
    children,
    orientation: _orientation,
    layoutDirection: _layoutDirection,
    pageMargin: _pageMargin,
    offscreenPageLimit: _offscreenPageLimit,
    overScrollMode: _overScrollMode,
    keyboardDismissMode: _keyboardDismissMode,
    scrollEnabled: _scrollEnabled,
    ...viewProps
  },
  ref
) {
  const pages = React.Children.toArray(children);
  const [selectedPage, setSelectedPage] = React.useState(() => Math.max(0, initialPage));

  const selectPage = React.useCallback((page: number) => {
    const lastPage = Math.max(0, pages.length - 1);
    const nextPage = Math.max(0, Math.min(lastPage, Math.trunc(page)));
    setSelectedPage(nextPage);
    onPageScroll?.({ nativeEvent: { position: nextPage, offset: 0 } } as PageScrollEvent);
    onPageSelected?.({ nativeEvent: { position: nextPage } } as PagerViewOnPageSelectedEvent);
  }, [onPageScroll, onPageSelected, pages.length]);

  React.useImperativeHandle(ref, () => ({
    setPage: selectPage,
    setPageWithoutAnimation: selectPage,
  }), [selectPage]);

  return (
    <View {...viewProps}>
      {pages.map((page, index) => (
        <View
          key={(page as React.ReactElement<{ key?: React.Key }>).key ?? index}
          accessibilityElementsHidden={index !== selectedPage}
          style={[styles.page, index !== selectedPage && styles.hiddenPage]}
        >
          {page}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  hiddenPage: {
    display: 'none',
  },
});

export default ClientOrdersPager;
