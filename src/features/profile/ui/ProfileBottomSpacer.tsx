import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Only reserve the system gesture area; Profile has no bottom navigation.
export function ProfileBottomSpacer() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.bottom + 8 }} />;
}
