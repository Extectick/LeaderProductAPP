/** Only a canonical, bounded Help destination can navigate from an AI answer. */
export function parseHelpChatLink(value:unknown):number|null {
 if(typeof value!=='string')return null;
 const match=/^leaderproduct:\/\/services\/help\?ticketId=([1-9]\d{0,9})$/.exec(value);
 if(!match||match[0]!==value)return null;
 const ticketId=Number(match[1]);
 return Number.isSafeInteger(ticketId)&&ticketId<=2147483647?ticketId:null;
}

export function helpChatDestination(ticketId:number){
 if(!Number.isSafeInteger(ticketId)||ticketId<1||ticketId>2147483647)throw Error('HELP_CHAT_LINK_INVALID');
 // Clear an earlier message/HTML deep-link intent when reusing the Help route.
 return {pathname:'/services/help' as const,params:{ticketId:String(ticketId),messageId:undefined,eventId:undefined,htmlId:undefined}};
}
