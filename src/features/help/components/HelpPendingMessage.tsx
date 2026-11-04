import React, {useCallback,useMemo} from 'react';
import {HelpMessageBubble} from './HelpMessageBubble';
import type {HelpAttachment,HelpMessage} from '../helpApi';
import {HelpMessageQuote} from './HelpMessageQuote';
import type {ResolveHelpMedia} from './HelpMedia';
import {Image,Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {HelpPending} from '../helpDurableTypes';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {helpTime} from '../helpUiUtils';
import {HELP_MESSAGE_TEXT_STYLE,HelpInlineMessageStamp,HelpMessageStampReserve} from './HelpInlineMessageStamp';
export function HelpPendingMessage({item,onRetry,onQuote,resolve,groupFirst=true,groupLast=true}:{item:HelpPending;groupFirst?:boolean;groupLast?:boolean;onRetry:()=>void;onQuote?:(id:number)=>void;resolve?:ResolveHelpMedia}){
  const c=useHelpTheme(),reduced=useHelpReducedMotion(),failed=item.status==='failed';
  const time=helpTime(new Date(item.createdAt).toISOString());
  const plainText=Boolean(item.input.text)&&!item.input.attachmentIds?.length&&!item.localFiles?.length&&!item.action;
  if(item.localFiles?.length&&!item.input.attachmentIds?.length&&!item.action)return <HelpPendingMedia item={item} onRetry={onRetry} onQuote={onQuote} resolve={resolve} groupFirst={groupFirst} groupLast={groupLast}/>;
  if(plainText)return <View testID={`help-pending-${item.key}`} style={{alignItems:'flex-end',marginHorizontal:12,marginTop:groupFirst?4:1,marginBottom:groupLast?4:1}}>
    <View testID="help-pending-bubble" style={{maxWidth:'86%',minWidth:90,borderRadius:16,borderTopRightRadius:groupFirst?16:4,borderBottomRightRadius:groupLast?16:4,backgroundColor:c.outgoing}}>
      {item.replyTo?<HelpMessageQuote quote={item.replyTo} onQuote={onQuote} resolve={resolve}/>:null}
      <View testID="help-pending-content" style={{paddingHorizontal:11,paddingVertical:6}}><Text accessibilityLabel={item.input.text} style={[HELP_MESSAGE_TEXT_STYLE,{color:c.text}]}>{item.input.text}<HelpMessageStampReserve time={time}/></Text>
      <HelpInlineMessageStamp time={time} status={item.status??'queued'} reduced={reduced} muted={c.muted} receiptColor={c.muted} danger={c.danger} onRetry={onRetry}/></View>
    </View>
  </View>;
  return <View testID={`help-pending-${item.key}`} style={{alignItems:'flex-end',marginHorizontal:12,marginVertical:4}}>
    <View style={{maxWidth:'86%',borderRadius:16,borderBottomRightRadius:4,backgroundColor:c.outgoing,padding:12,gap:5}}>
      {item.replyTo?<HelpMessageQuote quote={item.replyTo} onQuote={onQuote} resolve={resolve}/>:null}
      {item.localFiles?.map((file,index)=><View key={`${file.uri}:${index}`} style={{flexDirection:'row',alignItems:'center',gap:8,maxWidth:240}}>
        {file.mimeType?.startsWith('image/')?<Image source={{uri:file.uri}} style={{width:64,height:64,borderRadius:8}}/>:<Ionicons name={file.mimeType?.startsWith('audio/')?'mic-outline':'document-outline'} size={24} color={c.muted}/>}
        <Text numberOfLines={2} style={{color:c.text,flexShrink:1}}>{file.name}</Text>
      </View>)}
      <Text selectable style={{color:c.text,fontSize:15,lineHeight:22}}>{item.input.text||`Вложения: ${item.localFiles?.length??item.input.attachmentIds?.length??0}`}</Text>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:6}}>
        {failed?<Pressable accessibilityRole="button" accessibilityLabel="Не удалось отправить. Отправить снова" onPress={onRetry} hitSlop={12} style={{width:18,height:18,alignItems:'center',justifyContent:'center'}}><Ionicons name="alert-circle-outline" size={16} color={c.danger}/></Pressable>:<Ionicons testID="help-message-pending-clock" accessibilityLabel="Сообщение ещё не доставлено" name="time-outline" size={14} style={{lineHeight:14,includeFontPadding:false}} color={c.muted}/>}
        <Text style={{fontSize:10,lineHeight:14,includeFontPadding:false,color:c.muted}}>{helpTime(new Date(item.createdAt).toISOString())}</Text>
      </View>
    </View>
  </View>;
}

const pendingMediaNoop=()=>{};
/** The outbox and server receipt use the same album, voice player and caption
 * geometry. Upload acknowledgement changes delivery state, never a 64px file
 * placeholder into an entire photograph under the following reader. */
function HelpPendingMedia({item,onRetry,onQuote,resolve,groupFirst,groupLast}:Parameters<typeof HelpPendingMessage>[0]){
  const message=useMemo<HelpMessage>(()=>({
    id:0,ticketId:item.ticketId??0,sequence:0,clientMessageId:item.input.clientMessageId??item.key,
    authorId:0,author:null,authorRole:'USER',kind:'TEXT',text:item.input.text,
    createdAt:new Date(item.createdAt).toISOString(),editedAt:null,
    replyToId:item.replyTo?.id??null,replyTo:item.replyTo??null,forwardedFromId:null,rating:null,reactions:[],
    attachments:(item.localFiles??[]).map((file,index)=>({id:`pending:${item.key}:${index}`,name:file.name,
      mimeType:file.mimeType??'application/octet-stream',size:file.size??0,
      kind:file.mimeType?.startsWith('image/')?'IMAGE':file.mimeType?.startsWith('audio/')?'AUDIO':'FILE',
      url:file.uri,width:file.width,height:file.height,position:index})),
  }),[item.key,item.ticketId,item.input.text,item.input.clientMessageId,item.createdAt,item.replyTo,item.localFiles]);
  const localResolve=useCallback<ResolveHelpMedia>((file:HelpAttachment)=>file.id.startsWith(`pending:${item.key}:`)?Promise.resolve({uri:file.url}):resolve?resolve(file):Promise.resolve({uri:file.url}),[item.key,resolve]);
  return <View testID={`help-pending-${item.key}`}><HelpMessageBubble message={message} userId={0} open={false} canInteract={false}
    selected={false} highlighted={false} solution={false} groupFirst={groupFirst} groupLast={groupLast}
    deliveryStatus={item.status??'queued'} onRetry={onRetry} resolve={localResolve}
    onMenu={pendingMediaNoop} onDismissMenu={pendingMediaNoop} onReply={pendingMediaNoop} onCopy={pendingMediaNoop}
    onEdit={pendingMediaNoop} onForward={pendingMediaNoop} onReaction={pendingMediaNoop} onQuote={onQuote??pendingMediaNoop}
    onImage={pendingMediaNoop} onFile={pendingMediaNoop} onCloseTicket={pendingMediaNoop} onRequestIt={pendingMediaNoop} onError={pendingMediaNoop}/></View>;
}
