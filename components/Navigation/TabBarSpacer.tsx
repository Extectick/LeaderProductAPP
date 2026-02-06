import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FLOATING_TAB_BAR_BOTTOM_OFFSET,
  FLOATING_TAB_BAR_HEIGHT,
} from '@/components/Navigation/FloatingTabBar';

export function useTabBarSpacerHeight() {
  const insets = useSafeAreaInsets();
  return FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_OFFSET + insets.bottom;
}

export default function TabBarSpacer({ extra = 0 }: { extra?: number }) {
  const height = useTabBarSpacerHeight();
  return <View style={{ height: height + extra }} />;
}
