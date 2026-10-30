export type HelpPushTarget = { ticketId: number; messageId?: number; eventId?: number;assistant?:boolean;ticketTitle?:string;preview?:string;recipientUserId?:number };
export function parseHelpPush(data: unknown): HelpPushTarget | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (!['HELP_MESSAGE','HELP_TICKET'].includes(String(value.type))) return null;
  const ticketId = Number(value.ticketId), messageId = Number(value.messageId), eventId = Number(value.eventId),recipientUserId=Number(value.recipientUserId);
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) return null;
  return { ticketId, ...(Number.isSafeInteger(messageId) && messageId > 0 ? {messageId} : {}), ...(Number.isSafeInteger(eventId) && eventId > 0 ? {eventId} : {}), ...(Number.isSafeInteger(recipientUserId)&&recipientUserId>0?{recipientUserId}:{}), ...(typeof value.assistant==='boolean'?{assistant:value.assistant}:{}), ...(typeof value.ticketTitle==='string'?{ticketTitle:value.ticketTitle.slice(0,200)}:{}), ...(typeof value.preview==='string'?{preview:value.preview.slice(0,160)}:{}) };
}
