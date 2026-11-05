import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpMessage } from '../helpApi';
import { helpAssistantPhaseLabel, type HelpAssistantActivity } from '../helpAssistant';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { helpTime } from '../helpUiUtils';
import {HelpAiIcon} from './HelpAiIcon';
import {HelpAssistantItAction} from './HelpAssistantItAction';
import {HelpAssistantFiles} from './HelpAssistantFiles';
import type {ResolveHelpMedia} from './HelpMedia';
import {HelpMarkdown} from './HelpMarkdown';
import {HelpHtmlAttachments} from './HelpHtmlContext';

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

export function HelpLiveAssistantMessage({ message, onRetry, onConnectOnec, onSuggestion, onRequestIt, resolve, onFileError }: {
  resolve?: ResolveHelpMedia; onFileError?: (text: string) => void;
  message: HelpMessage; onRetry?: () => void; onConnectOnec?: () => void;
  onSuggestion?: (text: string) => void; onRequestIt?: () => void;
}) {
  const c = useHelpTheme(), reduced = useHelpReducedMotion(), run = message.assistantRun!;
  const active = run.status === 'thinking' || run.status === 'streaming';
  const [expanded, setExpanded] = useState<boolean | null>(null), [now, setNow] = useState(Date.now);
  const [selected, setSelected] = useState<string | null>(null);
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
      <HelpMarkdown text={text}/>
    </View> : null}
    {onSuggestion && run.status === 'completed' && !selected && run.suggestions?.length ? <View testID="help-ai-suggestions" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {run.suggestions.map(value => <Pressable key={value} accessibilityRole="button" onPress={() => { if (submission.current) return; submission.current = true; setSelected(value); onSuggestion(value); }} style={{ minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: c.line }}><Text style={{ color: c.accentText, fontSize: 13 }}>{value}</Text></Pressable>)}
    </View> : null}
    <HelpHtmlAttachments/>
    <HelpAssistantFiles attachments={message.attachments || []} resolve={resolve} onError={onFileError}/>
    <HelpAssistantItAction run={run} onRequestIt={onRequestIt}/>
    {run.action?.type === 'connect_onec' && onConnectOnec ? <Pressable accessibilityRole="button" accessibilityLabel="Подключить 1С" onPress={onConnectOnec} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="lock-closed-outline" size={17} color={c.accentText}/><Text style={{ color: c.accentText }}>Подключить 1С</Text></Pressable> : null}
    {message.text ? <Text style={{ alignSelf: 'flex-end', color: c.muted, fontSize: 10 }}>{helpTime(message.createdAt)}</Text> : null}
  </View>;
}
