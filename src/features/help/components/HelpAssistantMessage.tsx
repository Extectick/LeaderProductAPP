import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpMessage } from '../helpApi';
import { HELP_ASSISTANT_STEPS } from '../helpAssistant';
import type { HelpAssistantPreview, HelpAssistantScenario } from '../helpAssistant';
import { helpTime } from '../helpUiUtils';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { helpDevState } from '../helpDiagnostics';
import { HelpAssistantAvatar } from './HelpAssistantAvatar';

export function HelpAssistantPreviewMenu({ preview, ticketId, onClose }: { preview: HelpAssistantPreview; ticketId?: number; onClose: () => void }) {
  const c = useHelpTheme();
  const options: [HelpAssistantScenario, string][] = [['answer', 'Обычный ответ'], ['slow', 'Долгий анализ'], ['question', 'Уточняющий вопрос'], ['error', 'Ошибка обработки']];
  return <View style={{ gap: 3, marginBottom: 12 }}><Text style={{ color: c.muted, fontSize: 12, marginBottom: 6 }}>Режим ответа ИИ · для следующего сообщения</Text>{options.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: preview.scenario === value }} onPress={() => { preview.setScenario(value); onClose(); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name={preview.scenario === value ? 'radio-button-on' : 'radio-button-off'} size={20} color={preview.scenario === value ? c.accentText : c.muted}/><Text style={{ color: c.text, fontSize: 14 }}>{label}</Text></Pressable>)}{ticketId !== undefined && <Pressable accessibilityRole="button" onPress={() => { preview.replay(ticketId); onClose(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.accentText, fontSize: 14 }}>Повторить последний сценарий ИИ</Text></Pressable>}</View>;
}

export function HelpAssistantMessage({ message, onRetry }: { message: HelpMessage; onRetry?: () => void }) {
  const c = useHelpTheme(), reduced = useHelpReducedMotion(), run = message.assistantRun!;
  const active = run.status === 'thinking' || run.status === 'streaming';
  const opacity = useRef(new Animated.Value(active ? 0 : 1)).current;
  const height = useRef(new Animated.Value(Math.max(44, 24 + (run.step + 1) * 20 + run.step * 9))).current, measured = useRef(0);
  useEffect(() => { if (!active) { opacity.setValue(1); return; } opacity.setValue(reduced ? 1 : 0); const animation = Animated.timing(opacity, { toValue: 1, duration: reduced ? 0 : 180, easing: Easing.out(Easing.quad), useNativeDriver: true }); animation.start(); return () => animation.stop(); }, [run.runId, opacity, reduced, active]);
  useEffect(() => () => height.stopAnimation(), [height]);
  useEffect(() => { helpDevState({ assistantStatus: run.status, assistantStep: run.step, assistantCompletedSteps: run.completedSteps, assistantEventId: run.eventId, assistantTicketId: run.ticketId, assistantAnswerLength: message.text.length }); }, [run, message.text.length]);
  return <Animated.View testID="help-assistant-message" style={{ height: active ? height : undefined, marginTop: 8, marginBottom: 10, marginHorizontal: 16, overflow: 'hidden' }}><Animated.View onLayout={event => {
    const next = Math.ceil(event.nativeEvent.layout.height);
    if (!active) { measured.current = next; height.setValue(next); return; }
    if (next === measured.current) return;
    const initial = measured.current === 0; measured.current = next; height.stopAnimation();
    if (initial || reduced) height.setValue(next);
    else Animated.timing(height, { toValue: next, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }} style={{ opacity, position: active ? 'absolute' : 'relative', top: 0, left: 0, right: 0, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
    <View><HelpAssistantAvatar ticketId={message.ticketId}/></View>
    <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
      {!message.text && run.status !== 'completed' && <View style={{ borderRadius: 16, backgroundColor: c.incoming, overflow: 'hidden' }}>
        {active ? <View style={{ padding: 12, gap: 9 }}>{HELP_ASSISTANT_STEPS.map((label, index) => index <= run.step && <View key={label} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 20 }}><View style={{ width: 15, height: 18, alignItems: 'center', justifyContent: 'center' }}>{index < run.completedSteps ? <Ionicons name="checkmark" size={15} color={c.green}/> : reduced ? <Ionicons name="time-outline" size={15} color={c.accentText}/> : <ActivityIndicator testID="help-assistant-step-loader" size={14} color={c.accentText}/>}</View><Text style={{ color: index < run.completedSteps ? c.muted : c.text, fontSize: 13, lineHeight: 18, flex: 1 }}>{index === 0 && (run.contextMessageCount ?? 1) > 1 ? 'Учитываю уточнение к задаче' : label}</Text></View>)}</View> : <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4, gap: 8 }}>
          <Text style={{ color: run.status === 'error' ? c.danger : c.muted, fontSize: 13, lineHeight: 18, flex: 1 }}>{run.status === 'error' ? 'Не удалось подготовить ответ' : 'Ответ остановлен'}</Text>
          {onRetry && <Pressable accessibilityRole="button" accessibilityLabel="Повторить ответ ИИ" onPress={onRetry} style={{ minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="refresh-outline" size={17} color={c.accentText}/><Text style={{ color: c.accentText, fontSize: 13 }}>Повторить</Text></Pressable>}
        </View>}
      </View>}
      {Boolean(message.text) && <View style={{ backgroundColor: c.incoming, borderRadius: 16, borderTopLeftRadius: 4, padding: 12 }}><Text selectable style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>{message.text}</Text><Text style={{ color: c.muted, fontSize: 10, textAlign: 'right', marginTop: 4 }}>{helpTime(message.createdAt)}</Text></View>}
      {Boolean(message.text) && run.status === 'stopped' && run.stopReason !== 'superseded' && <Pressable accessibilityRole="button" accessibilityLabel="Повторить обработку ИИ" onPress={onRetry} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.accentText, fontSize: 12 }}>Ответ остановлен · Повторить</Text></Pressable>}
    </View>
  </Animated.View></Animated.View>;
}
