import React from 'react';
import {ActivityIndicator,Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {HelpPending} from '../helpDurableTypes';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {helpTime} from '../helpUiUtils';
export function HelpPendingMessage({item,onRetry}:{item:HelpPending;onRetry:()=>void}){
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),failed=item.status==='failed',sending=item.status==='sending';
  const status=failed?'Не отправлено':sending?'Отправляется':'Ожидает отправки';
  return <View testID={`help-pending-${item.key}`} style={{alignItems:'flex-end',paddingHorizontal:12,paddingVertical:4}}>
    <View style={{maxWidth:'86%',borderRadius:16,borderBottomRightRadius:4,backgroundColor:c.outgoing,padding:12,gap:5}}>
      <Text selectable style={{color:c.text,fontSize:15,lineHeight:22}}>{item.input.text||`Вложения: ${item.input.attachmentIds?.length??0}`}</Text>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:6}}>
        <Text style={{fontSize:10,color:c.muted}}>{helpTime(new Date(item.createdAt).toISOString())}</Text>
        {sending&&!reduced?<ActivityIndicator size={12} color={c.muted}/>:<Ionicons name={failed?'alert-circle-outline':'time-outline'} size={14} color={failed?c.danger:c.muted}/>}
        <Text style={{fontSize:11,color:failed?c.danger:c.muted}}>{status}</Text>
      </View>
      {failed?<Pressable accessibilityRole="button" accessibilityLabel="Повторить отправку этого сообщения" onPress={onRetry} style={{minHeight:44,justifyContent:'center',alignItems:'flex-end'}}><Text style={{color:c.accentText,fontSize:13}}>Повторить</Text></Pressable>:null}
    </View>
  </View>;
}
