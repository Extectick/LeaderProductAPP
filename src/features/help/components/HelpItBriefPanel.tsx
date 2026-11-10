import React,{useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {createHelpApi} from '../helpApi';
import type {HelpItBrief,HelpItBriefItem} from '../helpItBrief';
import {useHelpTheme} from '../helpTheme';

const speakers={owner:'Сотрудник',it:'IT',assistant:'ИИ',summary:'Сводка ИИ',tool_execution:'Инструмент'};
const kinds:Record<string,string>={goal:'Цель',constraint:'Условия',decision:'Решение',reported_result:'Сообщённый результат',open_question:'Открытый вопрос на момент сводки'};

/** Mounted only on explicit IT menu action; requests are bound to the account.
 * Closing/changing the ticket discards late responses without a global error. */
export function HelpItBriefPanel({ticketId,userId,onMessage,onScroll}:{ticketId:number;userId:number;onMessage:(id:number)=>void;onScroll?:(offset:number)=>void}){
  const c=useHelpTheme(),api=useMemo(()=>createHelpApi(userId),[userId]);
  const {height}=useWindowDimensions();
  const [result,setResult]=useState<HelpItBrief|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0),[expanded,setExpanded]=useState(false);
  useEffect(()=>{
    let active=true;setResult(null);setError(false);setExpanded(false);
    void api.itBrief(ticketId).then(value=>{if(active&&value.ticketId===ticketId)setResult(value);},()=>{if(active)setError(true);});
    return()=>{active=false;};
  },[api,ticketId,revision]);
  const renderItem=(value:HelpItBriefItem,key:string,label?:string)=><View key={key} style={{gap:5,marginBottom:12}}>
    <Text style={{color:c.muted,fontSize:12}}>{label||speakers[value.provenance]}</Text><Text selectable style={{color:c.text,fontSize:14,lineHeight:20}}>{value.text}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{value.messageIds.map(id=><Pressable key={id} accessibilityRole="button" accessibilityLabel={`Открыть сообщение ${id}`} onPress={()=>onMessage(id)} style={{minHeight:36,justifyContent:'center'}}><Text style={{color:c.accentText,fontSize:13}}>Сообщение #{id}</Text></Pressable>)}</View>
  </View>;
  if(error)return <View style={{gap:12}}><Text style={{color:c.muted}}>Не удалось загрузить контекст обращения.</Text><Pressable accessibilityRole="button" onPress={()=>setRevision(value=>value+1)} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.accentText}}>Повторить</Text></Pressable></View>;
  if(!result)return <ActivityIndicator accessibilityLabel="Загрузка контекста обращения" color={c.accent}/>;
  return <ScrollView testID="help-it-brief" style={{maxHeight:Math.min(440,Math.max(80,height-200))}} onScroll={event=>onScroll?.(Math.max(0,event.nativeEvent.contentOffset.y))} scrollEventThrottle={16}>
    <Text style={{color:c.muted,fontSize:12,lineHeight:18,marginBottom:14}}>Срез переписки на момент открытия. Сообщения ИИ и сводка не подтверждают, что проблема решена.</Text>
    {result.initialRequest?renderItem(result.initialRequest,'initial','Исходное обращение'):null}
    {result.latestRequest&&result.latestRequest.messageIds[0]!==result.initialRequest?.messageIds[0]?renderItem(result.latestRequest,'latest','Последнее сообщение сотрудника'):null}
    <Pressable testID="help-it-brief-expand" accessibilityRole="button" accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.accentText}}>{expanded?'Свернуть подробности':'Условия, проверки и последние ответы'}</Text></Pressable>
    {expanded?<View>
      {result.summary?<><Text style={{color:c.muted,fontSize:12,lineHeight:18,marginVertical:10}}>Сводка ИИ до сообщения №{result.summary.coveredThrough}. Ниже могут быть более поздние уточнения.</Text>{result.summary.items.map((value,index)=>renderItem(value,`summary-${index}`,kinds[value.kind]||'Сводка ИИ'))}</>:<Text style={{color:c.muted,marginVertical:10}}>Готовой сводки нет. Используйте исходные сообщения ниже.</Text>}
      <Text style={{color:c.text,fontWeight:'600',marginVertical:10}}>Операции и ошибки</Text>
      <Text style={{color:c.muted,fontSize:12,lineHeight:18,marginBottom:10}}>«Завершена» означает завершение вызова инструмента, а не проверку решения.</Text>
      {result.checks.length?result.checks.map((value,index)=>renderItem(value,`check-${index}`,`${value.status==='completed'?'Завершена':value.status==='failed'?'Ошибка':'Остановлена'}${value.errorCode?` · ${value.errorCode}`:''}`)):<Text style={{color:c.muted,marginBottom:12}}>В последних сообщениях нет записанных операций.</Text>}
      <Text style={{color:c.text,fontWeight:'600',marginVertical:10}}>Последние сообщения</Text>
      {result.recentMessages.map((value,index)=>renderItem(value,`recent-${index}`))}
    </View>:null}
  </ScrollView>;
}
