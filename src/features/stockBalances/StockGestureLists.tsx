import React from 'react';
import type { FlatListProps, RefreshControlProps } from 'react-native';
import { FlatList, RefreshControl } from 'react-native-gesture-handler';

// Both the native scroll view AND SwipeRefreshLayout wait for the horizontal
// recognizer. Disabling refresh from a JS onStart callback is already too late.
export const StockSwipeRefContext = React.createContext<React.RefObject<any> | null>(null);
export function StockFlatList<T>(props: FlatListProps<T>) {
  const swipe = React.useContext(StockSwipeRefContext);
  return <FlatList {...props} waitFor={swipe ? [swipe] : undefined} />;
}
export const StockRefreshControl = React.forwardRef<any, RefreshControlProps>(function StockRefreshControl(props, ref) {
  const swipe = React.useContext(StockSwipeRefContext);
  return <RefreshControl {...props} ref={ref} waitFor={swipe ? [swipe] : undefined} />;
});
