import React from 'react';
import { StyleSheet, View } from 'react-native';

export default function ChartSkeleton() {
  return (
    <View style={styles.box}>
      <View style={styles.line} />
      <View style={[styles.line, { width: '85%' }]} />
      <View style={[styles.line, { width: '70%' }]} />
      <View style={[styles.line, { width: '60%' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: '#EEF2FF',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
  },
  line: {
    height: 14,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    marginBottom: 8,
  },
});
