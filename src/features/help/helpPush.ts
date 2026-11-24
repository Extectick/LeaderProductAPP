export const HELP_NOTIFICATION_EVENT_TYPES = ['TICKET_CREATED','MESSAGE_CREATED','TICKET_CLOSED','TICKET_REOPENED','IT_REQUESTED','IT_JOINED'] as const;
export type HelpNotificationEventType = typeof HELP_NOTIFICATION_EVENT_TYPES[number];
export type HelpPushTarget = { ticketId: number; scheduleId?:string; runId?:string; messageId?: number; eventId?: number;assistant?:boolean;ticketTitle?:string;preview?:string;recipientUserId?:number;eventType?:HelpNotificationEventType };
export function parseHelpPush(data: unknown): HelpPushTarget | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if(value.type==='HELP_SCHEDULE_REPORT'){
    const {scheduleId,runId}=value;
    const ticketId=Number(value.ticketId),recipientUserId=Number(value.recipientUserId);
    if(!Number.isSafeInteger(ticketId) || ticketId<=0 || !Number.isSafeInteger(recipientUserId) || recipientUserId<=0) return null;
    if(typeof scheduleId!=='string' || typeof runId!=='string' || !/^[a-z0-9_-]{1,128}$/i.test(scheduleId) || !/^[a-z0-9_-]{1,128}$/i.test(runId))return null;
    return {ticketId,scheduleId,runId,recipientUserId};
  }
  if (!['HELP_MESSAGE','HELP_TICKET'].includes(String(value.type))) return null;
  const ticketId = Number(value.ticketId), messageId = Number(value.messageId), eventId = Number(value.eventId),recipientUserId=Number(value.recipientUserId);
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) return null;
  const eventType = HELP_NOTIFICATION_EVENT_TYPES.find(type => type === value.eventType);
  return { ticketId, ...(eventType ? {eventType} : {}), ...(Number.isSafeInteger(messageId) && messageId > 0 ? {messageId} : {}), ...(Number.isSafeInteger(eventId) && eventId > 0 ? {eventId} : {}), ...(Number.isSafeInteger(recipientUserId)&&recipientUserId>0?{recipientUserId}:{}), ...(typeof value.assistant==='boolean'?{assistant:value.assistant}:{}), ...(typeof value.ticketTitle==='string'?{ticketTitle:value.ticketTitle.slice(0,200)}:{}), ...(typeof value.preview==='string'?{preview:value.preview.slice(0,160)}:{}) };
}
