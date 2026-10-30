import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { helpAssistantAvatarColor } from '../helpAssistant';
import { useHelpTheme } from '../helpTheme';

export function HelpAssistantAvatar({ ticketId, size = 30, muted = false, loading = false, reducedMotion = false }: { ticketId: number; size?: number; muted?: boolean; loading?: boolean; reducedMotion?: boolean }) {
  const c = useHelpTheme(), badgeSize = Math.max(14, Math.round(size * .45));
  return <View testID={`help-assistant-avatar-${ticketId}`} accessibilityLabel="ИИ-помощник" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: helpAssistantAvatarColor(ticketId), alignItems: 'center', justifyContent: 'center', opacity: muted ? .7 : 1 }}>
    <Ionicons name="hardware-chip-outline" size={Math.round(size * .6)} color="#FFF"/>
    {loading && <View testID={`help-assistant-avatar-loading-${ticketId}`} accessibilityRole="progressbar" accessibilityLabel="ИИ обрабатывает обращение" style={{ position: 'absolute', right: -2, bottom: -2, width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
      {reducedMotion ? <Ionicons name="time-outline" size={badgeSize - 3} color={c.accentText}/> : <ActivityIndicator size={badgeSize - 4} color={c.accentText}/>}
    </View>}
  </View>;
}
