import React from 'react';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpAssistantRun } from '../helpAssistant';
import { useHelpTheme } from '../helpTheme';

export function HelpAssistantItAction({ run, onRequestIt }: {
  run: HelpAssistantRun; onRequestIt?: () => void;
}) {
  const c = useHelpTheme();
  const offered = run.status === 'error' || run.status === 'completed' &&
    (run.action?.type === 'request_it' || Boolean(run.handoffReason));
  if (!offered || !onRequestIt) return null;
  return <Pressable testID="help-ai-request-it" accessibilityRole="button"
    accessibilityLabel="Вызвать IT-специалиста" onPress={onRequestIt}
    style={{ minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
      gap: 8, marginTop: 4, paddingHorizontal: 14, paddingVertical: 10,
      borderWidth: 1, borderColor: c.line, borderRadius: 16 }}>
    <Ionicons name="headset-outline" size={18} color={c.accentText}/>
    <Text style={{ color: c.accentText, fontSize: 14 }}>Вызвать IT-специалиста</Text>
  </Pressable>;
}
