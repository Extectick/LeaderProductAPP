export type HelpNotificationRoute = 'ignore'|'chat'|'banner';
export function helpNotificationRoute(active:boolean,openedTicketId:number|null,ticketId:number):HelpNotificationRoute {
  if(!active)return 'ignore';
  return openedTicketId===ticketId?'chat':'banner';
}
