import React,{useMemo,useRef} from 'react';
import {Platform,Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {HelpTicket} from '../helpApi';
import type {HelpTypingUser} from '../helpTypingModel';
import {useHelpTheme,useHelpReducedMotion} from '../helpTheme';
import {helpMessagePreview} from '../helpMessagePreview';
import {helpListDate} from '../helpUiUtils';
import {helpTicketMenuAnchor,type HelpTicketMenuAnchor} from '../helpTicketMenu';
import {HELP_LIST_INSET,HELP_LIST_META_WIDTH} from '../helpLayout';
import {helpDevRef} from '../helpDiagnostics';
import {HelpAvatar,HelpTyping} from './HelpPrimitives';
import {HelpAiIcon} from './HelpAiIcon';
import {HelpAssistantAvatar} from './HelpAssistantAvatar';

/** The ticket list and destination picker use one presentation and hit target. */
export type HelpTicketRowProps = { selected?:boolean; ticket: HelpTicket; dateNow:number; typing?: HelpTypingUser[]; draft?:string; onPress: () => void; onMenu?: (anchor?:HelpTicketMenuAnchor) => void; disabled?: boolean; diagnostics?: boolean };
export function HelpTicketRow(props: HelpTicketRowProps) {
  const latest=useRef(props);latest.current=props;
  const actions=useMemo(()=>({onPress:()=>latest.current.onPress(),onMenu:(anchor?:HelpTicketMenuAnchor)=>latest.current.onMenu?.(anchor)}),[]);
  return <MemoTicketRow {...props} onPress={actions.onPress} onMenu={props.onMenu?actions.onMenu:undefined}/>;
}
const MemoTicketRow = React.memo(function TicketRowBody({ ticket, dateNow, typing, draft, onPress, onMenu, selected, disabled=false, diagnostics=true }: HelpTicketRowProps) {
  const c=useHelpTheme(); const reduced=useHelpReducedMotion(); const members=ticket.members.filter(m=>m.role==='IT'); const preview=ticket.lastMessage; const closed=ticket.status==='CLOSED';
  const previewText=useMemo(()=>helpMessagePreview(preview?.text||''),[preview?.text]);
  return <Pressable testID={`help-ticket-row-${ticket.id}`} {...(Platform.OS==='web'&&onMenu&&!disabled ? {onContextMenu:(event:any)=>{event.preventDefault();event.stopPropagation?.();if((event.pointerType??event.nativeEvent?.pointerType)!=='touch')onMenu(helpTicketMenuAnchor(event));},onKeyDown:(event:any)=>{if((event.shiftKey&&event.key==='F10')||event.key==='ContextMenu'){event.preventDefault();event.stopPropagation?.();onMenu(helpTicketMenuAnchor(event,true));}}} : {})} accessibilityRole="button" accessibilityState={{selected:Boolean(selected),disabled}} disabled={disabled} accessibilityLabel={`Обращение ${ticket.number}, ${ticket.title}${closed ? ', закрыто' : ''}${ticket.unreadCount ? `, непрочитанных: ${ticket.unreadCount}` : ''}`} onPress={onPress} onLongPress={onMenu&&!disabled?()=>onMenu():undefined} delayLongPress={500} style={({pressed})=>({minHeight:76,paddingHorizontal:HELP_LIST_INSET,paddingVertical:12,gap:12,flexDirection:'row',alignItems:'center',opacity:disabled?.5:1,backgroundColor:selected ? c.soft : closed ? c.closedBackground : pressed ? c.soft : 'transparent',transform:[{scale:pressed&&!reduced ? .988 : 1}]})}>
    <View style={{width:52,height:48,justifyContent:'center'}}>
      {members.length>1 ? members.slice(0,2).map((member,index)=><View key={member.userId} style={{position:'absolute',top:index===0 ? 2 : 16,left:index===0 ? 0 : 18,width:34,height:34,borderRadius:17,borderWidth:2,borderColor:c.background,zIndex:index}}><HelpAvatar id={member.userId} name={member.user.name} uri={member.user.avatarUrl} size={30} muted={closed} fallback={<HelpAiIcon size={18}/>}/></View>) : members.length===1 ? <HelpAvatar id={members[0].userId} name={members[0].user.name} uri={members[0].user.avatarUrl} size={46} muted={closed} fallback={<HelpAiIcon size={28}/>}/> : <HelpAssistantAvatar ticketId={ticket.id} size={46} muted={closed}/>}
      <View style={{position:'absolute',right:-4,top:-7,borderRadius:5,backgroundColor:c.incoming,paddingHorizontal:4,paddingVertical:1,zIndex:5,borderWidth:1,borderColor:c.line}}><Text style={{color:c.text,fontSize:9,lineHeight:13,fontWeight:'600'}}>#{ticket.number}</Text></View>
      {members.length>2 ? <View style={{position:'absolute',bottom:-5,right:-5,minWidth:21,backgroundColor:c.panel,borderRadius:9,paddingHorizontal:3,borderWidth:2,borderColor:c.background,zIndex:5}}><Text style={{color:c.text,fontSize:10,lineHeight:15,fontWeight:'600'}}>+{members.length-2}</Text></View> : null}
    </View>
    <View style={{flex:1,minWidth:0}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
        <View style={{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:4}}><Text numberOfLines={1} style={{flex:1,color:closed ? c.closedText : c.text,fontSize:15,lineHeight:22,fontWeight:'600'}}>{ticket.title}</Text>{closed ? <Ionicons name="lock-closed-outline" accessibilityLabel="Закрыто" size={15} color={c.muted}/> : null}</View>
        <View ref={diagnostics?node=>helpDevRef(`list.meta.${ticket.id}`,node):undefined} testID={`help-ticket-meta-${ticket.id}`} style={{width:HELP_LIST_META_WIDTH,alignItems:'center'}}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{color:c.muted,fontSize:11,lineHeight:22,fontVariant:['tabular-nums'],textAlign:'center'}}>{helpListDate(preview?.createdAt||ticket.createdAt,new Date(dateNow))}</Text></View>
      </View>
      <View testID={`help-ticket-preview-row-${ticket.id}`} style={{marginTop:3,minHeight:20,flexDirection:'row',alignItems:'center',gap:8}}>
        <View style={{flex:1,minWidth:0}}>{typing?.length&&!closed ? <HelpTyping users={typing} compact/> : <Text numberOfLines={1} style={{color:c.muted,fontSize:13,lineHeight:20}}>{draft?.trim() ? <><Text style={{color:c.draftText}}>Черновик: </Text>{draft}</> : previewText || (preview?.attachments.length ? preview.attachments[0].kind==='AUDIO' ? 'Голосовое сообщение' : preview.attachments.length>1 ? `Вложения (${preview.attachments.length})` : preview.attachments[0].name : 'Обращение создано')}</Text>}</View>
        {ticket.unreadCount>0 ? <View ref={diagnostics?node=>helpDevRef(`list.unread.${ticket.id}`,node):undefined} testID={`help-ticket-unread-${ticket.id}`} style={{backgroundColor:c.accentText,borderRadius:12,minWidth:20,marginHorizontal:(HELP_LIST_META_WIDTH-20)/2,height:20,paddingHorizontal:5,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#FFF',fontSize:11,fontWeight:'600'}}>{ticket.unreadCount}</Text></View> : null}
      </View>
    </View>
  </Pressable>;
});
