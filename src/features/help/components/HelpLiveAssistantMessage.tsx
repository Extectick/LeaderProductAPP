import {HelpAssistantProgress} from './HelpAssistantProgress';
import {type HelpAssistantQuestionState} from './HelpAssistantQuestionStatus';
import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpMessage } from '../helpApi';
import { useHelpTheme } from '../helpTheme';
import {HelpAssistantHeading} from './HelpAssistantHeading';
import {HelpAssistantItAction} from './HelpAssistantItAction';
import {HelpAssistantFiles} from './HelpAssistantFiles';
import type {ResolveHelpMedia} from './HelpMedia';
import {HelpStreamingAnswer} from './HelpStreamingText';
import {HelpHtmlAttachments} from './HelpHtmlContext';

export function HelpLiveAssistantMessage({ message, questionState, onRetry, onConnectOnec, onSuggestion, onRequestIt, resolve, onFileError }: {
  resolve?: ResolveHelpMedia; onFileError?: (text: string) => void;
  message: HelpMessage; questionState?: HelpAssistantQuestionState; onRetry?: () => void; onConnectOnec?: () => void;
  onSuggestion?: (text: string) => void; onRequestIt?: () => void;
}) {
  const c = useHelpTheme(), run = message.assistantRun!;
  const active = run.status === 'thinking' || run.status === 'streaming';
  const [selected, setSelected] = useState<string | null>(null);
  const submission = useRef(false);
  const text = message.text || (active || run.status==='stopped'&&run.stopReason==='user' ? run.draftText || '' : '');
  return <View testID="help-assistant-message" style={{ marginVertical: 8, marginHorizontal: 24, gap: 4 }}>
    <HelpAssistantHeading active={active} questionState={questionState} status={run.status==='error'?'Не удалось завершить ответ':run.status==='stopped'?'Ответ остановлен':null}/>
        <HelpAssistantProgress run={run}/>
    {run.error?<Text accessibilityRole="alert" style={{color:c.danger,fontSize:13,lineHeight:19}}>{run.error}</Text>:null}
    {!active&&run.status!=='completed'&&onRetry?<Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Повторить ответ ИИ" style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.accentText,fontSize:13}}>Повторить</Text></Pressable>:null}
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
