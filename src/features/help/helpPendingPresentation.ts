import type {HelpAttachment,HelpMessage} from './helpApi';
import type {HelpPending} from './helpDurableTypes';

/** Local pixels and media metadata use the same layout as the server receipt. */
export function helpPendingMessage(item:HelpPending,userId:number):HelpMessage {
  const attachments:HelpAttachment[]=(item.localFiles??[]).map((file,index)=>({
    id:`local:${item.key}:${index}`,name:file.name,mimeType:file.mimeType??'application/octet-stream',size:file.size??0,
    kind:file.mimeType?.startsWith('image/')?'IMAGE':file.mimeType?.startsWith('audio/')?'AUDIO':'FILE',
    url:file.uri,localUri:file.uri,width:file.width,height:file.height,durationMs:file.durationMs,
  }));
  return {id:-1,ticketId:item.ticketId??0,sequence:0,clientMessageId:item.input.clientMessageId??item.key,
    authorId:userId,author:null,authorRole:'USER',kind:item.action==='close'?'CLOSURE':'TEXT',text:item.input.text,
    createdAt:new Date(item.createdAt).toISOString(),editedAt:null,replyToId:item.input.replyToId??null,replyTo:item.replyTo??null,
    forwardedFromId:null,rating:item.input.rating??null,attachments,reactions:[]};
}
