export function parseHelpPush(data: unknown): { ticketId: number; messageId?: number } | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (!['HELP_MESSAGE','HELP_TICKET'].includes(String(value.type))) return null;
  const ticketId = Number(value.ticketId), messageId = Number(value.messageId);
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) return null;
  return { ticketId, ...(Number.isSafeInteger(messageId) && messageId > 0 ? {messageId} : {}) };
}
