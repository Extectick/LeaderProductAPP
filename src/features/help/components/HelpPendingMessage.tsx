import React from 'react';
import {HelpMessageBubble} from './HelpMessageBubble';
import {helpPendingMessage} from '../helpPendingPresentation';
import {HelpMessageQuote} from './HelpMessageQuote';
import type {ResolveHelpMedia} from './HelpMedia';
import {Text,View} from 'react-native';
import type {HelpPending} from '../helpDurableTypes';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {helpTime} from '../helpUiUtils';
import {HELP_MESSAGE_TEXT_STYLE,HelpInlineMessageStamp,HelpMessageStampReserve} from './HelpInlineMessageStamp';
export function HelpPendingMessage({item,onRetry,onQuote,resolve,groupFirst=true,groupLast=true}:{item:HelpPending;groupFirst?:boolean;groupLast?:boolean;onRetry:()=>void;onQuote?:(id:number)=>void;resolve?:ResolveHelpMedia}){
  const c=useHelpTheme(),reduced=useHelpReducedMotion();
  const time=helpTime(new Date(item.createdAt).toISOString());
  const plainText=Boolean(item.input.text)&&!item.input.attachmentIds?.length&&!item.localFiles?.length&&!item.action;
  if(plainText)return <View testID={`help-pending-${item.key}`} style={{alignItems:'flex-end',marginHorizontal:12,marginTop:groupFirst?4:1,marginBottom:groupLast?4:1}}>
    <View testID="help-pending-bubble" style={{maxWidth:'86%',minWidth:90,borderRadius:16,borderTopRightRadius:groupFirst?16:4,borderBottomRightRadius:groupLast?16:4,backgroundColor:c.outgoing}}>
      {item.replyTo?<HelpMessageQuote quote={item.replyTo} onQuote={onQuote} resolve={resolve}/>:null}
      <View testID="help-pending-content" style={{paddingHorizontal:11,paddingVertical:6}}><Text accessibilityLabel={item.input.text} style={[HELP_MESSAGE_TEXT_STYLE,{color:c.text}]}>{item.input.text}<HelpMessageStampReserve time={time}/></Text>
      <HelpInlineMessageStamp time={time} status={item.status??'queued'} reduced={reduced} muted={c.muted} receiptColor={c.muted} danger={c.danger} onRetry={onRetry}/></View>
    </View>
  </View>;
  return <View testID={`help-pending-${item.key}`}>
    <HelpMessageBubble message={helpPendingMessage(item,0)} userId={0} open={false} canInteract={false} selected={false} highlighted={false}
      solution={false} groupFirst={groupFirst} groupLast={groupLast} delivery={item.status??'queued'} onRetry={onRetry}
      resolve={async attachment=>attachment.localUri?{uri:attachment.localUri}:resolve?resolve(attachment):{uri:attachment.url}} onQuote={onQuote??(()=>{})}
      onMenu={()=>{}} onDismissMenu={()=>{}} onReply={()=>{}} onCopy={()=>{}} onEdit={()=>{}} onForward={()=>{}} onReaction={()=>{}}
      onImage={()=>{}} onFile={()=>{}} onCloseTicket={()=>{}} onRequestIt={()=>{}} onError={()=>{}}/>
  </View>;
}
