import React from 'react';
import {Pressable, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpTheme} from '../helpTheme';
import {helpCreated} from '../helpUiUtils';
import {HELP_LIST_INSET} from '../helpLayout';
import {HelpTicketHeading} from './HelpTicketHeading';

export type HelpTicketReferenceData = {
  id:number;number:number;title:string;status?:'OPEN'|'CLOSED';createdAt?:string;
};

export function HelpTicketReference({ticket,onPress}:{ticket:HelpTicketReferenceData;onPress:()=>void}) {
  const c=useHelpTheme();
  const meta=[ticket.status ? ticket.status==='CLOSED' ? 'Закрыто' : 'Открыто' : 'Исходное обращение',`#${ticket.number}`,ticket.createdAt ? helpCreated(ticket.createdAt) : null].filter(Boolean).join(' · ');
  return <Pressable testID="help-ticket-reference" accessibilityRole="button" accessibilityLabel={`Открыть исходное обращение №${ticket.number}: ${ticket.title}`} onPress={onPress}
    style={({pressed})=>({marginHorizontal:HELP_LIST_INSET,marginTop:8,marginBottom:12,minHeight:52,borderRadius:26,paddingHorizontal:14,paddingVertical:7,backgroundColor:c.panel,flexDirection:'row',gap:10,alignItems:'center',opacity:pressed ? .7 : 1})}>
    <View accessible={false} style={{width:24,height:28,alignItems:'center',justifyContent:'center'}}><Ionicons name="return-up-back" size={22} color={c.text}/></View>
    <HelpTicketHeading title={ticket.title} meta={meta}/>
    <Ionicons name="chevron-forward" color={c.muted} size={18} accessible={false}/>
  </Pressable>;
}
