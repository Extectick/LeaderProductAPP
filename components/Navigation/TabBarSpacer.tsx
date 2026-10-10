import React from 'react';
import { View } from 'react-native';

export function useTabBarSpacerHeight() {
  // Keep the shared layout API, without reserving space for a removed menu.
  return 0;
}

export default function TabBarSpacer({ extra = 0 }: { extra?: number }) {
  const height = useTabBarSpacerHeight();
  return <View style={{ height: height + extra }} />;
}
