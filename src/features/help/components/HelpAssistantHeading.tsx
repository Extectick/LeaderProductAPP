import React from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import {HelpAiIcon} from './HelpAiIcon';
import {HelpAssistantQuestionStatus,type HelpAssistantQuestionState} from './HelpAssistantQuestionStatus';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';

/** Stable identity for every answer; processing details are not an action. */
export function HelpAssistantHeading({active=false,status,questionState}:{active?:boolean;status?:string|null;questionState?:HelpAssistantQuestionState}){
 const c=useHelpTheme(),reduced=useHelpReducedMotion();
 return <View testID="help-ai-heading" style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:48,marginBottom:8}}>
  <View style={{width:42,height:42,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><HelpAiIcon size={30} color={c.accentText}/></View>
  <View style={{flex:1,minWidth:0,gap:3}}><Text accessibilityRole="header" style={{color:c.text,fontSize:15,lineHeight:21,fontWeight:'600'}}>ИИ ассистент</Text>
   {questionState?<HelpAssistantQuestionStatus state={questionState}/>:active||status?<View style={{flexDirection:'row',alignItems:'center',gap:6}}>{active&&!reduced?<ActivityIndicator size={12} color={c.muted}/>:null}<Text accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:12,lineHeight:17}}>{active?'Готовлю ответ…':status}</Text></View>:null}
  </View>
 </View>;
}
