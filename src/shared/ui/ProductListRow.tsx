import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

/** Shared flat product layout: image spans the row, title and metrics occupy the remaining width. */
export function ProductListRow({ thumbnail, children, selected, testID, thumbnailTestID, onPress }: React.PropsWithChildren<{
  thumbnail: React.ReactNode; selected?: boolean; testID?: string; thumbnailTestID?: string; onPress?: () => void;
}>) {
  const Root = onPress ? Pressable : View;
  return <Root testID={testID} onPress={onPress} accessible={false} focusable={false} style={[styles.row, selected && styles.selected]}>
    <View testID={thumbnailTestID} style={styles.thumbnail}>{thumbnail}</View>
    <View style={styles.content}>{children}</View>
  </Root>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 8, paddingHorizontal: 12, paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  selected: { backgroundColor: '#EFF6FF' },
  thumbnail: { width: 80, minHeight: 80, flexShrink: 0 },
  content: { flex: 1, minWidth: 0 },
});
