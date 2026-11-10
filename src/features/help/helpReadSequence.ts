import type {HelpMessage,HelpTicket} from './helpApi';
/** A progress placeholder can become the final answer at the same sequence later. */
export function readableHelpSequence(messages:HelpMessage[],requested:number){
  let sequence=0;
  for(const message of messages)if(message.sequence<=requested&&message.kind!=='ASSISTANT_PROGRESS'&&!['thinking','streaming'].includes(message.assistantRun?.status??''))sequence=Math.max(sequence,message.sequence);
  return sequence;
}

/** Read acknowledgements are monotonic even when an older list/sync request finishes later. */
export function mergeHelpReadState(ticket:HelpTicket,known?:HelpTicket|null):HelpTicket {
  if(!known||known.id!==ticket.id||(known.lastReadSequence??0)<=(ticket.lastReadSequence??0))return ticket;
  const lastReadSequence=known.lastReadSequence??0;
  const lastSequence=ticket.lastSequence??ticket.lastMessage?.sequence??0;
  // A newer answer can replace progress at the same sequence. Only retain a
  // partial unread count when the incoming ticket has no newer content either.
  const sameContent=lastSequence<=(known.lastSequence??known.lastMessage?.sequence??0)
    &&Date.parse(ticket.updatedAt)<=Date.parse(known.updatedAt);
  const unreadCount=lastSequence<=lastReadSequence?0:sameContent?known.unreadCount:ticket.unreadCount;
  return {...ticket,lastReadSequence,unreadCount};
}
