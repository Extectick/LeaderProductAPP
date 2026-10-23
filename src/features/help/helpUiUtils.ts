export const HELP_REOPEN_WINDOW = 72 * 60 * 60 * 1000;
export const HELP_EDIT_WINDOW = 60 * 60 * 1000;

export function helpDate(value: string, now = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (day === today) return 'Сегодня';
  if (day === new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
export const helpTime = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
export const helpCreated = (value: string) => new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
export const helpInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
export function helpColor(id: number) { return ['#447DB5', '#8468B3', '#388C85', '#B07842', '#B15B7A', '#668A45'][Math.abs(id) % 6]; }
export function canEditHelpMessage(message: { authorId: number | null; kind: string; createdAt: string }, userId: number, now = Date.now()) {
  const age = now - Date.parse(message.createdAt);
  return message.authorId === userId && message.kind !== 'SYSTEM' && age >= 0 && age < HELP_EDIT_WINDOW;
}
export function canReopenHelpTicket(ticket: { status: string; closedAt: string | null }, now = Date.now()) {
  const closed = ticket.closedAt ? Date.parse(ticket.closedAt) : NaN;
  return ticket.status === 'CLOSED' && Number.isFinite(closed) && now >= closed && now - closed <= HELP_REOPEN_WINDOW;
}
/** Freeze existing rows for a visible list session; newly received tickets append. */
export function stableHelpOrder<T extends { id: number; updatedAt: string }>(items: T[], order: number[]) {
  const known = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aa = known.get(a.id); const bb = known.get(b.id);
    if (aa !== undefined || bb !== undefined) return (aa ?? Infinity) - (bb ?? Infinity);
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id - a.id;
  });
}
export const helpDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export const helpFileSize = (size: number) => size >= 1048576 ? `${(size / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(size / 1024))} КБ`;
export function helpReplyGesture(dx: number, dy: number, previouslyBlocked = false) {
  const blocked = previouslyBlocked || dx < -4 || Math.abs(dy) > 12;
  return { blocked, capture: !blocked && dx > 12 && dx > Math.abs(dy) * 1.7 };
}
