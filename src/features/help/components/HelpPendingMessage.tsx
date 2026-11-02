import React from 'react';
import {HelpMessageQuote} from './HelpMessageQuote';
import type {ResolveHelpMedia} from './HelpMedia';
import {Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {HelpPending} from '../helpDurableTypes';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {helpTime} from '../helpUiUtils';
import {HELP_MESSAGE_TEXT_STYLE,HelpInlineMessageStamp,HelpMessageStampReserve} from './HelpInlineMessageStamp';
export function HelpPendingMessage({item,onRetry,onQuote,resolve}:{item:HelpPending;onRetry:()=>void;onQuote?:(id:number)=>void;resolve?:ResolveHelpMedia}){
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),failed=item.status==='failed';
  const time=helpTime(new Date(item.createdAt).toISOString());
  const plainText=Boolean(item.input.text)&&!item.input.attachmentIds?.length&&!item.action;
  if(plainText)return <View testID={`help-pending-${item.key}`} style={{alignItems:'flex-end',paddingHorizontal:12,paddingVertical:4}}>
    <View testID="help-pending-bubble" style={{maxWidth:'86%',minWidth:90,borderRadius:16,borderBottomRightRadius:4,backgroundColor:c.outgoing}}>
      {item.replyTo?<HelpMessageQuote quote={item.replyTo} onQuote={onQuote} resolve={resolve}/>:null}
      <View testID="help-pending-content" style={{paddingHorizontal:11,paddingVertical:6}}><Text accessibilityLabel={item.input.text} style={[HELP_MESSAGE_TEXT_STYLE,{color:c.text}]}>{item.input.text}<HelpMessageStampReserve time={time}/></Text>
      <HelpInlineMessageStamp time={time} status={item.status??'queued'} reduced={reduced} muted={c.muted} receiptColor={c.muted} danger={c.danger} onRetry={onRetry}/></View>
    </View>
  </View>;
  return <View testID={`help-pending-${item.key}`} style={{alignItems:'flex-end',paddingHorizontal:12,paddingVertical:4}}>
    <View style={{maxWidth:'86%',borderRadius:16,borderBottomRightRadius:4,backgroundColor:c.outgoing,padding:12,gap:5}}>
      {item.replyTo?<HelpMessageQuote quote={item.replyTo} onQuote={onQuote} resolve={resolve}/>:null}
      <Text selectable style={{color:c.text,fontSize:15,lineHeight:22}}>{item.input.text||`Вложения: ${item.input.attachmentIds?.length??0}`}</Text>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:6}}>
        {failed?<Pressable accessibilityRole="button" accessibilityLabel="Не удалось отправить. Отправить снова" onPress={onRetry} hitSlop={12} style={{width:18,height:18,alignItems:'center',justifyContent:'center'}}><Ionicons name="alert-circle-outline" size={16} color={c.danger}/></Pressable>:<Ionicons testID="help-message-pending-clock" accessibilityLabel="Сообщение ещё не доставлено" name="time-outline" size={14} color={c.muted}/>}
        <Text style={{fontSize:10,lineHeight:12,color:c.muted}}>{helpTime(new Date(item.createdAt).toISOString())}</Text>
      </View>
    </View>
  </View>;
}
