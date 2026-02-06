import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.container}>
      <Text numberOfLines={3} ellipsizeMode="tail" style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'center',
  },
  text: {
    width: '100%',
    maxWidth: 420,
    color: '#666',
    textAlign: 'center',
    flexShrink: 1,
    lineHeight: 22,
  },
});
