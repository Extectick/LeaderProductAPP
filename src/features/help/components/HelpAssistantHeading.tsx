import React from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {HelpAssistantQuestion} from '../helpAssistant';
import {HelpAssistantQuestionStatus,type HelpAssistantQuestionState} from './HelpAssistantQuestionStatus';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';

/** Answers have no repeated visual masthead. Keep the role available to assistive technology. */
export function HelpAssistantHeading({active=false,status,questionState,questions=[],questionReply}:{active?:boolean;status?:string|null;questionState?:HelpAssistantQuestionState;questions?:HelpAssistantQuestion[];questionReply?:React.ReactNode}){
 const c=useHelpTheme(),reduced=useHelpReducedMotion();
 return <View testID="help-ai-heading" style={{minWidth:0}}>
  <Text testID="help-ai-accessible-role" accessibilityRole="header" style={{position:'absolute',width:1,height:1,overflow:'hidden',opacity:0}}>ИИ ассистент</Text>
  {questionState?<HelpAssistantQuestionStatus state={questionState} questions={questions} questionReply={questionReply}/>:active||status?<View style={{flexDirection:'row',alignItems:'center',gap:8,minHeight:28,marginBottom:4}}>
   {active&&!reduced?<ActivityIndicator size={14} color={c.muted}/>:<Ionicons name={active?'ellipsis-horizontal':'information-circle-outline'} size={16} color={c.muted}/>}
   <Text accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:14,lineHeight:21}}>{active?'Готовлю ответ…':status}</Text>
  </View>:null}
 </View>;
}
