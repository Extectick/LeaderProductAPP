import React from 'react';
import {Pressable,Text,View} from 'react-native';
import type {HelpMessage} from '../helpApi';
import type {ResolveHelpMedia} from './HelpMedia';
import {useHelpTheme} from '../helpTheme';
import {HelpImage} from './HelpMedia';

export function HelpMessageQuote({quote,onQuote,resolve}:{quote:NonNullable<HelpMessage['replyTo']>;onQuote?:(id:number)=>void;resolve?:ResolveHelpMedia}){
  const c=useHelpTheme(),image=quote.attachments?.find(item=>item.kind==='IMAGE');
  return <Pressable testID="help-message-quote" accessibilityRole="button" accessibilityLabel="Перейти к исходному сообщению" disabled={!onQuote} onPress={()=>onQuote?.(quote.id)} style={{margin:7,padding:7,borderLeftWidth:2,borderLeftColor:c.accent,backgroundColor:c.elevated,borderRadius:6,flexDirection:'row',gap:7}}>
    {image&&resolve?<HelpImage attachment={image} resolve={resolve} style={{width:34,height:34,borderRadius:4}}/>:null}
    <View style={{flex:1}}><Text numberOfLines={1} style={{color:c.accentText,fontWeight:'600',fontSize:12}}>{quote.author?.name||'Сообщение'}</Text><Text numberOfLines={2} style={{color:c.muted,fontSize:12}}>{quote.text||'Вложение'}</Text></View>
  </Pressable>;
}
