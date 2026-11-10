export type HelpWebSelection = number | 'new' | null;
export function readHelpWebLocation(href:string) {
  const url=new URL(href),id=Number(url.searchParams.get('ticketId')),messageId=Number(url.searchParams.get('messageId'));
  return {
    selection:(Number.isSafeInteger(id)&&id>0?id:url.searchParams.get('draft')==='new'?'new':null) as HelpWebSelection,
    messageId:Number.isSafeInteger(messageId)&&messageId>0?messageId:undefined,
    filter:url.searchParams.get('filter')==='closed'?'CLOSED' as const:'OPEN' as const,
  };
}

/** Preserve router-owned state and unrelated URL parameters; never put drafts in URLs. */
export function helpWebSelectionUrl(href:string,selection:HelpWebSelection,filter:'OPEN'|'CLOSED') {
  const url=new URL(href);
  for(const key of ['ticketId','messageId','eventId','draft','filter'])url.searchParams.delete(key);
  if(typeof selection==='number')url.searchParams.set('ticketId',String(selection));
  if(selection==='new')url.searchParams.set('draft','new');
  if(filter==='CLOSED')url.searchParams.set('filter','closed');
  return url.href;
}
