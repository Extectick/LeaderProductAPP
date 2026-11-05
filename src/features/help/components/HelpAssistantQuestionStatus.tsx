import React from 'react';
import {Text} from 'react-native';
import {useHelpTheme} from '../helpTheme';

export type HelpAssistantQuestionState = 'waiting' | 'answered';

/** The question itself has one visible home: the expanded composer. */
export function HelpAssistantQuestionStatus({state}:{state:HelpAssistantQuestionState}) {
  const c=useHelpTheme();
  return <Text testID="help-assistant-question-status" numberOfLines={1} accessibilityLiveRegion="polite" style={{flex:1,color:c.muted,fontSize:13,lineHeight:19}}>{state==='waiting'?'ИИ ожидает ответ':'Ответы получены'}</Text>;
}
