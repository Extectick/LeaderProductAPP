import {appWebControlProps} from '@/components/ui/appWebInteraction';
import React,{useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {HelpAssistantQuestion} from '../helpAssistant';
import {useHelpTheme} from '../helpTheme';

export type HelpAssistantQuestionState = 'waiting' | 'answered';

/** Read-only question history; answering still belongs to the existing composer. */
export function HelpAssistantQuestionStatus({state,questions=[],questionReply}:{state:HelpAssistantQuestionState;questions?:HelpAssistantQuestion[];questionReply?:React.ReactNode}) {
  const c=useHelpTheme();
  const [expanded,setExpanded]=useState(false),answered=state==='answered';
  // A confirmed exchange renders its original answer controls in this AI row.
  // No disclosure state or extra loading phase may hide the received answer.
  if(questionReply)return <View testID="help-assistant-question-history" style={{minWidth:0}}>{questionReply}</View>;
  const label=questions.length===1?questions[0].question:questions.length?`Уточнения · ${questions.length}`:'Уточнение';
  return <View testID="help-assistant-question-history" style={{minWidth:0}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:8,minHeight:44}}>
    <Ionicons name={answered?'checkmark-circle-outline':'chatbubble-ellipses-outline'} size={16} color={c.muted}/>
    <View style={{flex:1,minWidth:0,gap:2}}><Text numberOfLines={expanded?undefined:2} style={{color:c.text,fontSize:14,lineHeight:21}}>{label}</Text>
     <Text testID="help-assistant-question-status" accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:12,lineHeight:18}}>{answered?'Ответ получен':'Ожидает ответа'}</Text>
    </View>
    {questions.length?<Pressable {...appWebControlProps('subtle')} testID="help-question-history-toggle" accessibilityRole="button"
      accessibilityLabel={`${expanded?'Свернуть':'Показать'} уточнения ИИ`} aria-expanded={expanded} accessibilityState={{expanded}}
      onPress={()=>setExpanded(value=>!value)} style={{width:36,height:36,borderRadius:8,alignItems:'center',justifyContent:'center'}} hitSlop={4}>
      <Ionicons name={expanded?'chevron-up':'chevron-down'} size={14} color={c.muted}/>
    </Pressable>:null}
   </View>
   {expanded?<View testID="help-question-history-details" style={{marginLeft:24,paddingLeft:12,borderLeftWidth:1,borderLeftColor:c.line,gap:10,marginTop:4,marginBottom:8}}>{questions.map(question=><View key={question.id} style={{gap:4}}>
    {questions.length>1?<Text selectable style={{color:c.text,fontSize:14,lineHeight:22}}>{question.question}</Text>:null}
    {question.options.length?<Text selectable style={{color:c.muted,fontSize:13,lineHeight:21}}>{question.options.map(option=>option.label).join(' · ')}</Text>:null}
    {!question.options.length&&questions.length===1?<Text style={{color:c.muted,fontSize:13,lineHeight:21}}>{answered?'Ответ пользователя — в следующем сообщении.':'Ответьте в поле сообщения внизу чата.'}</Text>:null}
   </View>)}</View>:null}
  </View>;
}
