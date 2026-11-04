import React, {useCallback,useMemo,useRef} from 'react';
import {HelpMessageBubble} from './HelpMessageBubble';
import {helpPendingMessage} from '../helpPendingPresentation';
import {HelpMessageQuote} from './HelpMessageQuote';
import type {ResolveHelpMedia} from './HelpMedia';
import {Text,View} from 'react-native';
import type {HelpPending} from '../helpDurableTypes';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {helpTime} from '../helpUiUtils';
import {HELP_MESSAGE_TEXT_STYLE,HelpInlineMessageStamp,HelpMessageStampReserve} from './HelpInlineMessageStamp';
const noop=()=>{};
export function HelpPendingMessage({item,onRetry,onQuote,resolve,groupFirst=true,groupLast=true}:{item:HelpPending;groupFirst?:boolean;groupLast?:boolean;onRetry:()=>void;onQuote?:(id:number)=>void;resolve?:ResolveHelpMedia}){
  const c=useHelpTheme(),reduced=useHelpReducedMotion();
  const latest=useRef({onRetry,onQuote});latest.current={onRetry,onQuote};
  const actions=useMemo(()=>({onRetry:()=>latest.current.onRetry(),onQuote:(id:number)=>latest.current.onQuote?.(id)}),[]);
  const message=useMemo(()=>helpPendingMessage(item,0),[item]);
  // Resolver identity is a media lifecycle/account fence. Draft and callback
  // updates keep it stable; a real parent resolver change still releases audio.
  const resolvePending=useCallback<ResolveHelpMedia>(async attachment=>attachment.localUri?{uri:attachment.localUri}:resolve?resolve(attachment):{uri:attachment.url},[resolve]);
  const time=useMemo(()=>helpTime(new Date(item.createdAt).toISOString()),[item.createdAt]);
  const plainText=Boolean(item.input.text)&&!item.input.attachmentIds?.length&&!item.localFiles?.length&&!item.action;
  if(plainText)return <View testID={`help-pending-${item.key}`} style={{alignItems:'flex-end',marginHorizontal:12,marginTop:groupFirst?4:1,marginBottom:groupLast?4:1}}>
    <View testID="help-pending-bubble" style={{maxWidth:'86%',minWidth:90,borderRadius:16,borderTopRightRadius:groupFirst?16:4,borderBottomRightRadius:groupLast?16:4,backgroundColor:c.outgoing}}>
      {item.replyTo?<HelpMessageQuote quote={item.replyTo} onQuote={onQuote} resolve={resolve}/>:null}
      <View testID="help-pending-content" style={{paddingHorizontal:11,paddingVertical:6}}><Text accessibilityLabel={item.input.text} style={[HELP_MESSAGE_TEXT_STYLE,{color:c.text}]}>{item.input.text}<HelpMessageStampReserve time={time}/></Text>
      <HelpInlineMessageStamp time={time} status={item.status??'queued'} reduced={reduced} muted={c.muted} receiptColor={c.muted} danger={c.danger} onRetry={actions.onRetry}/></View>
    </View>
  </View>;
  return <View testID={`help-pending-${item.key}`}>
    <HelpMessageBubble message={message} userId={0} open={false} canInteract={false} selected={false} highlighted={false}
      solution={false} groupFirst={groupFirst} groupLast={groupLast} delivery={item.status??'queued'} onRetry={actions.onRetry}
      resolve={resolvePending} onQuote={actions.onQuote}
      onMenu={noop} onDismissMenu={noop} onReply={noop} onCopy={noop} onEdit={noop} onForward={noop} onReaction={noop}
      onImage={noop} onFile={noop} onCloseTicket={noop} onRequestIt={noop} onError={noop}/>
  </View>;
}
