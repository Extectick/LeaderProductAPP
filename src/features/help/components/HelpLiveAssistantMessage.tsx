import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpMessage } from '../helpApi';
import { helpAssistantPhaseLabel, type HelpAssistantActivity } from '../helpAssistant';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { helpTime } from '../helpUiUtils';
import {HelpAiIcon} from './HelpAiIcon';

function AnswerText({ text }: { text: string }) {
  const c = useHelpTheme();
  return <Text selectable testID="help-assistant-text" style={{ color: c.text, fontSize: 15, lineHeight: 22, includeFontPadding: false }}>{text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? <Text key={index} style={{ fontWeight: '600' }}>{part.slice(2, -2)}</Text>
      : part.startsWith('`') && part.endsWith('`') ? <Text key={index} style={{ fontFamily: 'monospace', backgroundColor: c.elevated }}>{part.slice(1, -1)}</Text> : part)}</Text>;
}

function ActivityRow({ item }: { item: HelpAssistantActivity }) {
  const c = useHelpTheme();
  const icon = item.status === 'failed' ? 'alert-circle-outline' : item.kind === 'analysis' ? 'bulb-outline'
    : item.status === 'completed' ? 'checkmark' : item.kind === 'knowledge' ? 'search-outline' : 'ellipse-outline';
  return <View testID={`help-ai-activity-${item.id}`} style={{ gap: 5, paddingVertical: 5 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={icon} size={14} color={item.status === 'failed' ? c.danger : item.kind === 'analysis' ? c.accentText : c.muted}/>
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17, flex: 1 }}>{item.label}</Text>
    </View>
    {item.text?.trim() ? <Text selectable style={{ color: c.text, fontSize: 13, lineHeight: 20, paddingLeft: 22 }}>{item.text}</Text> : null}
  </View>;
}

export function HelpLiveAssistantMessage({ message, onRetry, onConnectOnec, onSuggestion, diagnostics }: {
  message: HelpMessage; onRetry?: () => void; onConnectOnec?: () => void;
  onSuggestion?: (text: string) => void; diagnostics?: boolean;
}) {
  const c = useHelpTheme(), reduced = useHelpReducedMotion(), run = message.assistantRun!;
  const active = run.status === 'thinking' || run.status === 'streaming';
  const [expanded, setExpanded] = useState<boolean | null>(null), [now, setNow] = useState(Date.now);
  const [selected, setSelected] = useState<string | null>(null), [showDiagnostics, setShowDiagnostics] = useState(false);
  const submission = useRef(false);
  const log=useRef<ScrollView>(null),followLog=useRef(true);
  const logAtEnd=(event:any)=>event.nativeEvent.contentSize.height-event.nativeEvent.layoutMeasurement.height-event.nativeEvent.contentOffset.y<24;
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  const open = expanded ?? active;
  const elapsed = Math.max(0, active ? now - (run.metrics?.startedAt || run.startedAt) : run.metrics?.elapsedMs || 0);
  const seconds = Math.floor(elapsed / 1000), activities = run.activities || [];
  const text = message.text || (active || run.status==='stopped'&&run.stopReason==='user' ? run.draftText || '' : '');
  const title = active ? helpAssistantPhaseLabel(run) : run.status === 'completed' ? 'Ход анализа' : run.status === 'error' ? 'Не удалось завершить ответ' : 'Анализ остановлен';
  return <View testID="help-assistant-message" style={{ marginVertical: 8, marginHorizontal: 24, gap: 12 }}>
    <View testID="help-ai-work-log">
      <Pressable accessibilityRole="button" accessibilityLabel={`${open ? 'Свернуть' : 'Показать'} ход анализа`} accessibilityState={{ expanded: open }} onPress={() => setExpanded(!open)} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {active && !reduced ? <ActivityIndicator size={14} color={c.accentText}/> : run.status==='error'?<Ionicons name="alert-circle-outline" size={16} color={c.danger}/>:<HelpAiIcon size={16} color={c.accentText}/>}
        <Text accessibilityLiveRegion="polite" style={{ color: c.muted, fontSize: 13, flex: 1 }}>{title}</Text>
        {seconds > 0 ? <Text style={{ color: c.muted, fontSize: 11, fontVariant: ['tabular-nums'] }}>{seconds} с</Text> : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={c.muted}/>
      </Pressable>
      {open && activities.length ? <View style={{ marginLeft: 7, paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: c.line }}>
        <ScrollView ref={log} nestedScrollEnabled style={{ maxHeight: 300 }} contentContainerStyle={{ paddingBottom: 4 }}
          onScrollBeginDrag={()=>{followLog.current=false;}} onScrollEndDrag={event=>{followLog.current=logAtEnd(event);}}
          onMomentumScrollEnd={event=>{followLog.current=logAtEnd(event);}}
          onContentSizeChange={()=>{if(active&&followLog.current)log.current?.scrollToEnd({animated:false});}}>
          {activities.map(item => <ActivityRow key={item.id} item={item}/>)}
        </ScrollView>
      </View> : null}
      {run.error ? <Text accessibilityRole="alert" style={{ color: run.status === 'error' ? c.danger : c.muted, fontSize: 13, lineHeight: 19, marginTop: 6 }}>{run.error}</Text> : null}
      {!active && run.status !== 'completed' && onRetry ? <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Повторить ответ ИИ" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.accentText, fontSize: 13 }}>Повторить</Text></Pressable> : null}
    </View>
    {text ? <View testID="help-ai-answer" style={{ gap: 6 }}>
      {active || !message.text ? <Text style={{ color: c.muted, fontSize: 11 }}>{active?'Формируется ответ…':'Незавершённый ответ'}</Text> : null}
      <AnswerText text={text}/>
    </View> : null}
    {onSuggestion && run.status === 'completed' && !selected && run.suggestions?.length ? <View testID="help-ai-suggestions" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {run.suggestions.map(value => <Pressable key={value} accessibilityRole="button" onPress={() => { if (submission.current) return; submission.current = true; setSelected(value); onSuggestion(value); }} style={{ minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: c.line }}><Text style={{ color: c.accentText, fontSize: 13 }}>{value}</Text></Pressable>)}
    </View> : null}
    {run.action?.type === 'connect_onec' && onConnectOnec ? <Pressable accessibilityRole="button" accessibilityLabel="Подключить 1С" onPress={onConnectOnec} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="lock-closed-outline" size={17} color={c.accentText}/><Text style={{ color: c.accentText }}>Подключить 1С</Text></Pressable> : null}
    {diagnostics && run.metrics ? <View>
      <Pressable accessibilityRole="button" onPress={() => setShowDiagnostics(!showDiagnostics)} style={{ minHeight: 36, justifyContent: 'center' }}><Text style={{ fontSize: 11, color: c.muted }}>Диагностика запуска {showDiagnostics ? '⌃' : '⌄'}</Text></Pressable>
      {showDiagnostics ? <Text selectable style={{ fontSize: 11, lineHeight: 17, color: c.muted }}>{[
        run.generation?.model, `Длительность: ${(elapsed / 1000).toFixed(1)} с`,
        run.metrics.firstAnalysisMs !== undefined ? `Первое пояснение: ${(run.metrics.firstAnalysisMs / 1000).toFixed(1)} с` : null,
        run.metrics.firstTokenMs !== undefined ? `Начало ответа: ${(run.metrics.firstTokenMs / 1000).toFixed(1)} с` : null,
        run.generation?.usage ? `Токены: ${run.generation.usage.totalTokens}; рассуждение: ${run.generation.usage.reasoningTokens ?? 'не сообщено'}` : 'Использование токенов не сообщено',
      ].filter(Boolean).join('\n')}</Text> : null}
    </View> : null}
    {message.text ? <Text style={{ alignSelf: 'flex-end', color: c.muted, fontSize: 10 }}>{helpTime(message.createdAt)}</Text> : null}
  </View>;
}
