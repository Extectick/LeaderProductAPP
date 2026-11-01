import React, { memo, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpMessage } from '../helpApi';
import { HELP_ASSISTANT_STEPS } from '../helpAssistant';
import type { HelpAssistantPreview, HelpAssistantScenario } from '../helpAssistant';
import { helpTime } from '../helpUiUtils';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';

export function HelpAssistantPreviewMenu({ preview, ticketId, onClose }: { preview: HelpAssistantPreview; ticketId?: number; onClose: () => void }) {
  const c = useHelpTheme();
  const options: [HelpAssistantScenario, string][] = [['answer', 'Обычный ответ'], ['slow', 'Долгий анализ'], ['question', 'Уточняющий вопрос'], ['error', 'Ошибка обработки']];
  return <View style={{ gap: 3, marginBottom: 12 }}><Text style={{ color: c.muted, fontSize: 12, marginBottom: 6 }}>Режим ответа ИИ · для следующего сообщения</Text>{options.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: preview.scenario === value }} onPress={() => { preview.setScenario(value); onClose(); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name={preview.scenario === value ? 'radio-button-on' : 'radio-button-off'} size={20} color={preview.scenario === value ? c.accentText : c.muted}/><Text style={{ color: c.text, fontSize: 14 }}>{label}</Text></Pressable>)}{ticketId !== undefined && <Pressable accessibilityRole="button" onPress={() => { preview.replay(ticketId); onClose(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.accentText, fontSize: 14 }}>Повторить последний сценарий ИИ</Text></Pressable>}</View>;
}

type MessageProps = {message: HelpMessage; onRetry?: () => void; onConnectOnec?: () => void};
export function HelpAssistantMessage(props: MessageProps) {
  const latest=useRef(props);latest.current=props;
  const canRetry=Boolean(props.onRetry),canConnect=Boolean(props.onConnectOnec);
  const actions=useMemo(()=>({
    onRetry:canRetry?()=>latest.current.onRetry?.():undefined,
    onConnectOnec:canConnect?()=>latest.current.onConnectOnec?.():undefined,
  }),[canRetry,canConnect]);
  return <MemoHelpAssistantMessage {...props} {...actions}/>;
}
const MemoHelpAssistantMessage = memo(function HelpAssistantMessageBody({ message, onRetry, onConnectOnec }: MessageProps) {
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),run=message.assistantRun!;
  const active=run.status==='thinking'||run.status==='streaming';
  const showRetry=Boolean(message.text)&&run.status==='stopped'&&run.stopReason!=='superseded';
  // Natural text layout has one owner. Streaming no longer measures a second
  // absolute copy or animates a clipping surface around an already growing row.
  return <View testID="help-assistant-message" style={{marginVertical:8,marginHorizontal:24}}>
    <View testID="help-assistant-surface" style={{minWidth:0}}>
      <View testID="help-assistant-body">
        {!message.text&&run.status!=='completed' ? active ? <View style={{gap:9,paddingVertical:6}}>
          {HELP_ASSISTANT_STEPS.map((label,index)=>index<=run.step?<View key={label} style={{flexDirection:'row',gap:8,alignItems:'center',minHeight:20}}>
            <View style={{width:15,alignItems:'center'}}>{index<run.completedSteps?<Ionicons name="checkmark" size={15} color={c.green}/>:reduced?<Ionicons name="time-outline" size={15} color={c.accentText}/>:<ActivityIndicator testID="help-assistant-step-loader" size={14} color={c.accentText}/>}</View>
            <Text style={{color:index<run.completedSteps?c.muted:c.text,fontSize:13,lineHeight:18,flex:1}}>{index===0&&(run.contextMessageCount??1)>1?'Учитываю уточнение к задаче':label}</Text>
          </View>:null)}
        </View>:<View style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:8}}>
          <Text style={{color:run.status==='error'?c.danger:c.muted,fontSize:13,flex:1}}>{run.status==='error'?'Не удалось подготовить ответ':'Ответ остановлен'}</Text>
          {onRetry?<Pressable accessibilityRole="button" accessibilityLabel="Повторить ответ ИИ" onPress={onRetry} style={{minHeight:44,paddingHorizontal:8,justifyContent:'center'}}><Text style={{color:c.accentText,fontSize:13}}>Повторить</Text></Pressable>:null}
        </View>:null}
        {message.text?<Text testID="help-assistant-text" selectable style={{color:c.text,fontSize:15,lineHeight:22,includeFontPadding:false}}>{message.text}</Text>:null}
        {run.action?.type==='connect_onec'&&onConnectOnec?<Pressable accessibilityRole="button" accessibilityLabel="Подключить 1С" onPress={onConnectOnec} style={{flexDirection:'row',gap:8,alignItems:'center',minHeight:44,marginTop:8}}><Ionicons name="lock-closed-outline" size={18} color={c.accentText}/><Text style={{color:c.accentText,fontSize:14,fontWeight:'600'}}>Подключить 1С</Text><Ionicons name="chevron-forward" size={16} color={c.accentText}/></Pressable>:null}
      </View>
      {message.text?<View testID="help-assistant-time" style={{alignSelf:'flex-end',marginTop:3}}><Text style={{color:c.muted,fontSize:10,lineHeight:12,includeFontPadding:false,fontVariant:['tabular-nums']}}>{helpTime(message.createdAt)}</Text></View>:null}
      {showRetry&&onRetry?<Pressable accessibilityRole="button" accessibilityLabel="Повторить обработку ИИ" onPress={onRetry} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.accentText,fontSize:12}}>Ответ остановлен · Повторить</Text></Pressable>:null}
    </View>
  </View>;
});
