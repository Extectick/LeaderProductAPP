import {HelpAssistantQuestionStatus, type HelpAssistantQuestionState} from './HelpAssistantQuestionStatus';
import React, { memo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpMessage } from '../helpApi';
import { helpAssistantPhaseLabel, type HelpAssistantActivity } from '../helpAssistant';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import {HelpAiIcon} from './HelpAiIcon';
import {HelpAssistantItAction} from './HelpAssistantItAction';
import {HelpAssistantFiles} from './HelpAssistantFiles';
import type {ResolveHelpMedia} from './HelpMedia';
import {HelpStreamingAnswer,HelpStreamingAnalysis} from './HelpStreamingText';
import {helpActivityLabel} from '../helpActivityPresentation';
import {HelpHtmlAttachments} from './HelpHtmlContext';

// API chunks can replace activity objects without changing their presentation.
// Primitive props let completed rows skip reconciliation during answer streaming.
const ActivityRow = memo(function ActivityRow({ live, ...item }: HelpAssistantActivity & {live:boolean}) {
  const c = useHelpTheme();
  const icon = item.status === 'failed' ? 'alert-circle-outline' : item.kind === 'analysis' ? 'bulb-outline'
    : item.status === 'completed' ? 'checkmark' : item.kind === 'knowledge' ? 'search-outline' : 'ellipse-outline';
  return <View testID={`help-ai-activity-${item.id}`} style={{ gap: 5, paddingVertical: 5 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={icon} size={14} color={item.status === 'failed' ? c.danger : item.kind === 'analysis' ? c.accentText : c.muted}/>
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17, flex: 1 }}>{helpActivityLabel(item)}</Text>
    </View>
    <HelpStreamingAnalysis identity={item.id} text={item.text||''} active={live&&item.kind==='analysis'&&item.status==='running'} completed={item.status==='completed'}/>
  </View>;
});

export function HelpLiveAssistantMessage({ message, questionState, onRetry, onConnectOnec, onSuggestion, onRequestIt, resolve, onFileError }: {
  resolve?: ResolveHelpMedia; onFileError?: (text: string) => void;
  message: HelpMessage; questionState?: HelpAssistantQuestionState; onRetry?: () => void; onConnectOnec?: () => void;
  onSuggestion?: (text: string) => void; onRequestIt?: () => void;
}) {
  const c = useHelpTheme(), reduced = useHelpReducedMotion(), run = message.assistantRun!;
  const active = run.status === 'thinking' || run.status === 'streaming';
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const submission = useRef(false);
  const log=useRef<ScrollView>(null),followLog=useRef(true);
  const logAtEnd=(event:any)=>event.nativeEvent.contentSize.height-event.nativeEvent.layoutMeasurement.height-event.nativeEvent.contentOffset.y<24;
  const open = expanded ?? active;
  const activities = run.activities || [];
  const text = message.text || (active || run.status==='stopped'&&run.stopReason==='user' ? run.draftText || '' : '');
  const title = active ? helpAssistantPhaseLabel(run) : run.status === 'completed' ? null : run.status === 'error' ? 'Не удалось завершить ответ' : 'Анализ остановлен';
  const showWorkLog = active || run.status !== 'completed' || activities.length > 0 || Boolean(run.error);
  return <View testID="help-assistant-message" style={{ marginVertical: 8, marginHorizontal: 24, gap: 4 }}>
    {showWorkLog ? <View testID="help-ai-work-log">
      <Pressable testID="help-ai-heading" accessibilityRole="button" accessibilityLabel={`${open ? 'Свернуть' : 'Показать'} действия ИИ`} accessibilityState={{ expanded: open }} onPress={() => setExpanded(!open)} style={{ minHeight: 44, minWidth: 44, alignSelf: title || questionState ? 'stretch' : 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {active && !reduced ? <ActivityIndicator size={14} color={c.accentText}/> : run.status==='error'?<Ionicons name="alert-circle-outline" size={16} color={c.danger}/>:<HelpAiIcon size={16} color={c.accentText}/>}
        {questionState ? <HelpAssistantQuestionStatus state={questionState}/> : title ? <Text accessibilityLiveRegion="polite" style={{ color: c.muted, fontSize: 13, flex: 1 }}>{title}</Text> : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={c.muted}/>
      </Pressable>
      {open && activities.length ? <View>
        <ScrollView ref={log} nestedScrollEnabled style={{ maxHeight: 300 }} contentContainerStyle={{ paddingBottom: 4 }}
          onScrollBeginDrag={()=>{followLog.current=false;}} onScrollEndDrag={event=>{followLog.current=logAtEnd(event);}}
          onMomentumScrollEnd={event=>{followLog.current=logAtEnd(event);}}
          onContentSizeChange={()=>{if(active&&followLog.current)log.current?.scrollToEnd({animated:false});}}>
          {activities.map(item => <ActivityRow key={item.id} id={item.id} kind={item.kind} status={item.status} label={item.label} text={item.text} live={active}/>)}
        </ScrollView>
      </View> : null}
      {run.error ? <Text accessibilityRole="alert" style={{ color: run.status === 'error' ? c.danger : c.muted, fontSize: 13, lineHeight: 19, marginTop: 6 }}>{run.error}</Text> : null}
      {!active && run.status !== 'completed' && onRetry ? <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Повторить ответ ИИ" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.accentText, fontSize: 13 }}>Повторить</Text></Pressable> : null}
    </View> : questionState ? <View testID="help-ai-heading" style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:8}}><HelpAiIcon size={16} color={c.accentText}/><HelpAssistantQuestionStatus state={questionState}/></View> : null}
    {!questionState ? <HelpStreamingAnswer identity={run.runId} text={text} status={run.status} draft={!message.text}/> : null}
    {!questionState && onSuggestion && run.status === 'completed' && !selected && run.suggestions?.length ? <View testID="help-ai-suggestions" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {run.suggestions.map(value => <Pressable key={value} accessibilityRole="button" onPress={() => { if (submission.current) return; submission.current = true; setSelected(value); onSuggestion(value); }} style={{ minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: c.line }}><Text style={{ color: c.accentText, fontSize: 13 }}>{value}</Text></Pressable>)}
    </View> : null}
    <HelpHtmlAttachments/>
    <HelpAssistantFiles attachments={message.attachments || []} resolve={resolve} onError={onFileError}/>
    <HelpAssistantItAction run={run} onRequestIt={onRequestIt}/>
    {run.action?.type === 'connect_onec' && onConnectOnec ? <Pressable accessibilityRole="button" accessibilityLabel="Подключить 1С" onPress={onConnectOnec} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="lock-closed-outline" size={17} color={c.accentText}/><Text style={{ color: c.accentText }}>Подключить 1С</Text></Pressable> : null}
  </View>;
}
