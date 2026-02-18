import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useServerStatus } from '@/src/shared/network/useServerStatus';

export default function ServerStatusIndicator() {
  const { isReachable, lastReason } = useServerStatus();
  const warn = useThemeColor({}, 'warning' as any) || '#D97706';

  if (isReachable) return null;

  return (
    <View style={[styles.wrap, { borderColor: `${warn}66`, backgroundColor: `${warn}14` }]}>
      <Ionicons name="cloud-offline-outline" size={14} color={warn} />
      {Platform.OS === 'web' ? (
        <Text style={[styles.text, { color: warn }]} numberOfLines={1}>
          Сервер недоступен
          {lastReason ? `: ${lastReason}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 28,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 240,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
});

