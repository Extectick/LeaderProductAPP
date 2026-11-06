import {HelpAssistantProgress} from './HelpAssistantProgress';
import {type HelpAssistantQuestionState} from './HelpAssistantQuestionStatus';
import React, { memo, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpMessage } from '../helpApi';
import type { HelpAssistantPreview, HelpAssistantScenario } from '../helpAssistant';
import { useHelpTheme } from '../helpTheme';
import {HelpMessageArrival} from './HelpMessageArrival';
import {HelpLiveAssistantMessage} from './HelpLiveAssistantMessage';
import {HelpAssistantItAction} from './HelpAssistantItAction';
import {HelpAssistantFiles} from './HelpAssistantFiles';
import type {ResolveHelpMedia} from './HelpMedia';
import {HelpMarkdown} from './HelpMarkdown';
import {HelpAssistantHeading} from './HelpAssistantHeading';
import {helpHtmlAttachmentId} from '../helpHtml';
import {HelpHtmlAttachments} from './HelpHtmlContext';

export function HelpAssistantPreviewMenu({ preview, ticketId, onClose }: { preview: HelpAssistantPreview; ticketId?: number; onClose: () => void }) {
  const c = useHelpTheme();
  const options: [HelpAssistantScenario, string][] = [['answer', 'Обычный ответ'], ['slow', 'Долгий анализ'], ['question', 'Уточняющий вопрос'], ['error', 'Ошибка обработки']];
  return <View style={{ gap: 3, marginBottom: 12 }}><Text style={{ color: c.muted, fontSize: 12, marginBottom: 6 }}>Режим ответа ИИ · для следующего сообщения</Text>{options.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: preview.scenario === value }} onPress={() => { preview.setScenario(value); onClose(); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name={preview.scenario === value ? 'radio-button-on' : 'radio-button-off'} size={20} color={preview.scenario === value ? c.accentText : c.muted}/><Text style={{ color: c.text, fontSize: 14 }}>{label}</Text></Pressable>)}{ticketId !== undefined && <Pressable accessibilityRole="button" onPress={() => { preview.replay(ticketId); onClose(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.accentText, fontSize: 14 }}>Повторить последний сценарий ИИ</Text></Pressable>}</View>;
}

type MessageProps = {questionState?: HelpAssistantQuestionState; resolve?: ResolveHelpMedia; onFileError?: (text: string) => void; message: HelpMessage; onRetry?: () => void; onConnectOnec?: () => void; onSuggestion?: (text: string) => void; onRequestIt?: () => void};
export function HelpAssistantMessage(props: MessageProps) {
  const latest=useRef(props);latest.current=props;
  const canRetry=Boolean(props.onRetry),canConnect=Boolean(props.onConnectOnec),canSuggest=Boolean(props.onSuggestion),canRequestIt=Boolean(props.onRequestIt);
  const actions=useMemo(()=>({
    onFileError:(text:string)=>latest.current.onFileError?.(text),
    onRequestIt:canRequestIt?()=>latest.current.onRequestIt?.():undefined,
    onRetry:canRetry?()=>latest.current.onRetry?.():undefined,
    onConnectOnec:canConnect?()=>latest.current.onConnectOnec?.():undefined,
    onSuggestion:canSuggest?(text:string)=>latest.current.onSuggestion?.(text):undefined,
  }),[canRetry,canConnect,canSuggest,canRequestIt]);
  const row=<MemoHelpAssistantMessage {...props} {...actions}/>;
  if(!(props.message.attachments||[]).some(file=>helpHtmlAttachmentId(file)!==null))return row;
  const {HelpHtmlMessageRoute}=require('./HelpHtmlMessageRoute') as typeof import('./HelpHtmlMessageRoute');
  return <HelpHtmlMessageRoute ticketId={props.message.ticketId} messageId={props.message.id} attachments={props.message.attachments} resolve={props.resolve}>{row}</HelpHtmlMessageRoute>;
}
const MemoHelpAssistantMessage = memo(function HelpAssistantMessageBody({ message, questionState, onRetry, onConnectOnec, onSuggestion, onRequestIt, resolve, onFileError }: MessageProps) {
  const c=useHelpTheme(),run=message.assistantRun!;
  const active=run.status==='thinking'||run.status==='streaming';
  const liveAnswer=useRef(active);if(active)liveAnswer.current=true;
  const showRetry=Boolean(message.text)&&run.status==='stopped'&&run.stopReason!=='superseded';
  if(run.activityVersion===1)return <HelpLiveAssistantMessage key={run.runId} message={message} questionState={questionState} resolve={resolve} onFileError={onFileError} onRetry={onRetry} onConnectOnec={onConnectOnec} onSuggestion={onSuggestion} onRequestIt={onRequestIt}/>;
  // Natural text layout has one owner. Streaming no longer measures a second
  // absolute copy or animates a clipping surface around an already growing row.
  return <View testID="help-assistant-message" style={{marginVertical:8,marginHorizontal:24}}>
    <View testID="help-assistant-surface" style={{minWidth:0}}>
      <View testID="help-assistant-body">
        <HelpAssistantHeading active={active} questionState={questionState} status={run.status==='error'?'Не удалось подготовить ответ':run.status==='stopped'?'Ответ остановлен':null}/>
        <HelpAssistantProgress run={run}/>
        {!active&&run.status!=='completed'&&!showRetry&&onRetry?<Pressable accessibilityRole="button" accessibilityLabel="Повторить ответ ИИ" onPress={onRetry} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.accentText,fontSize:13}}>Повторить</Text></Pressable>:null}
        {!questionState&&message.text?<HelpMessageArrival key={run.runId} identity={`assistant-answer:${run.runId}`} animate={liveAnswer.current}><HelpMarkdown text={message.text}/></HelpMessageArrival>:null}
        {run.action?.type==='connect_onec'&&onConnectOnec?<Pressable accessibilityRole="button" accessibilityLabel="Подключить 1С" onPress={onConnectOnec} style={{flexDirection:'row',gap:8,alignItems:'center',minHeight:44,marginTop:8}}><Ionicons name="lock-closed-outline" size={18} color={c.accentText}/><Text style={{color:c.accentText,fontSize:14,fontWeight:'600'}}>Подключить 1С</Text><Ionicons name="chevron-forward" size={16} color={c.accentText}/></Pressable>:null}
      </View>
      <HelpHtmlAttachments/>
      <HelpAssistantFiles attachments={message.attachments || []} resolve={resolve} onError={onFileError}/>
      <HelpAssistantItAction run={run} onRequestIt={onRequestIt}/>
      {showRetry&&onRetry?<Pressable accessibilityRole="button" accessibilityLabel="Повторить обработку ИИ" onPress={onRetry} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.accentText,fontSize:12}}>Ответ остановлен · Повторить</Text></Pressable>:null}
    </View>
  </View>;
});
