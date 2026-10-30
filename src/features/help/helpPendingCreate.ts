export function matchingPendingCreate<T extends {create:boolean;input:{text?:string;sourceTicketId?:number}}>(items:T[],text:string,sourceTicketId?:number){
  return items.find(item=>item.create&&(item.input.sourceTicketId??null)===(sourceTicketId??null)&&(item.input.text||'').trim()===text.trim());
}
