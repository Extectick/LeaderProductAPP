import React from 'react';
import {ActivityIndicator,Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {HelpPending} from '../helpDurableTypes';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {helpTime} from '../helpUiUtils';
import {HelpInlineMessageStamp,HelpMessageStampReserve} from './HelpInlineMessageStamp';
export function HelpPendingMessage({item,onRetry}:{item:HelpPending;onRetry:()=>void}){
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),failed=item.status==='failed';
  const time=helpTime(new Date(item.createdAt).toISOString());
  const plainText=Boolean(item.input.text)&&!item.input.attachmentIds?.length&&!item.action;
  if(plainText)return <View testID={`help-pending-${item.key}`} style={{alignItems:'flex-end',paddingHorizontal:12,paddingVertical:4}}>
    <View testID="help-pending-bubble" style={{maxWidth:'86%',minWidth:90,borderRadius:16,borderBottomRightRadius:4,backgroundColor:c.outgoing,paddingHorizontal:11,paddingVertical:8}}>
      <Text accessibilityLabel={item.input.text} style={{color:c.text,fontSize:15,lineHeight:21}}>{item.input.text}<HelpMessageStampReserve time={time}/></Text>
      <HelpInlineMessageStamp time={time} status={item.status??'queued'} reduced={reduced} muted={c.muted} receiptColor={c.muted} danger={c.danger} onRetry={onRetry}/>
    </View>
  </View>;
  return <View testID={`help-pending-${item.key}`} style={{alignItems:'flex-end',paddingHorizontal:12,paddingVertical:4}}>
    <View style={{maxWidth:'86%',borderRadius:16,borderBottomRightRadius:4,backgroundColor:c.outgoing,padding:12,gap:5}}>
      <Text selectable style={{color:c.text,fontSize:15,lineHeight:22}}>{item.input.text||`Вложения: ${item.input.attachmentIds?.length??0}`}</Text>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:6}}>
        {failed?<Pressable accessibilityRole="button" accessibilityLabel="Не удалось отправить. Отправить снова" onPress={onRetry} hitSlop={12} style={{width:18,height:18,alignItems:'center',justifyContent:'center'}}><Ionicons name="alert-circle-outline" size={16} color={c.danger}/></Pressable>:reduced?<Ionicons accessibilityLabel="Отправляется" name="ellipse-outline" size={12} color={c.muted}/>:<ActivityIndicator accessibilityLabel="Отправляется" size={12} color={c.muted}/>}
        <Text style={{fontSize:10,lineHeight:12,color:c.muted}}>{helpTime(new Date(item.createdAt).toISOString())}</Text>
      </View>
    </View>
  </View>;
}
