import React,{useCallback} from 'react';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {parseHelpHtmlLink} from '../helpHtml';
import {HelpHtmlMessage} from './HelpHtmlMessage';

/** Resolve share links only after normal chat/message access and history loading. */
export function HelpHtmlMessageRoute(props:React.ComponentProps<typeof HelpHtmlMessage>){
 const params=useLocalSearchParams<{ticketId?:string;messageId?:string;htmlId?:string}>(),router=useRouter();
 const id=typeof params.htmlId==='string'?parseHelpHtmlLink('leaderproduct://help-html/'+params.htmlId):null;
 const matches=Number(params.ticketId)===props.ticketId&&(!params.messageId||Number(params.messageId)===props.messageId);
 const consumed=useCallback(()=>router.setParams({htmlId:undefined}),[router]);
 return <HelpHtmlMessage {...props} requestedId={matches?id??undefined:undefined} onRequestConsumed={consumed}/>;
}
