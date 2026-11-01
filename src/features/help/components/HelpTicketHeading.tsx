import React from 'react';
import {Text, View} from 'react-native';
import {useHelpTheme} from '../helpTheme';

/** Ticket links and the chat header share the same two-line hierarchy. */
export function HelpTicketHeading({title,meta}:{title:string;meta:string}) {
  const c=useHelpTheme();
  return <View style={{flex:1,minWidth:0,justifyContent:'center',gap:1}}>
    <Text numberOfLines={1} style={{color:c.text,fontSize:15,lineHeight:20,fontWeight:'600'}}>{title}</Text>
    {meta ? <Text numberOfLines={1} style={{color:c.muted,fontSize:10,lineHeight:14}}>{meta}</Text> : null}
  </View>;
}
