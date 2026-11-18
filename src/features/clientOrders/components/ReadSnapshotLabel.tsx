import React from 'react';
import {Text, Tooltip} from 'react-native-paper';
export function ReadSnapshotLabel({hint, label = 'Предыдущие данные'}: {hint: string | null; label?: string}) {
  if (!hint) return null;
  return <Tooltip title={hint}><Text accessibilityLabel={hint} numberOfLines={1}
    style={{fontSize: 10, lineHeight: 14, color: '#64748B'}}>{label}</Text></Tooltip>;
}
