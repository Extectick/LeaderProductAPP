import type { HelpMessage } from '../../src/features/help/helpApi';
import type { HelpHistoryQuery, HelpSearchResult } from '../../src/features/help/helpHistoryTypes';
import { helpLocalDayBounds } from '../../src/features/help/helpDateNavigation';

const HISTORY_START = Date.UTC(2025, 0, 1, 8, 0);
export const QA_HISTORY_PAGE_SIZE = 60;

/** Stable ids, dates, sizes and search markers make pagination captures reproducible. */
export function createFixtureHistory(ticketId: number, count: number, sample: HelpMessage, owner: HelpMessage['author'], specialist: HelpMessage['author']): HelpMessage[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1, own = sequence % 3 === 0;
    const marker = sequence % 47 === 0 ? 'Контроль обмена: найден нужный заказ.' : sequence % 19 === 0 ? 'Проверка принтера завершена.' : 'Проверяем статус обращения и продолжаем работу.';
    return { ...sample, id: sequence, ticketId, sequence, clientMessageId: null, authorId: own ? owner!.id : specialist!.id, author: own ? owner : specialist, authorRole: own ? 'USER' : 'IT', kind: 'TEXT', text: `${marker}\nЗапись ${sequence}.${sequence % 7 === 0 ? '\nДополнительная информация для проверки высоты сообщения и устойчивости прокрутки.' : ''}`, createdAt: new Date(HISTORY_START + index * 6 * 3600000).toISOString(), editedAt: null, replyToId: sequence > 90 && sequence % 61 === 0 ? sequence - 90 : null, replyTo: sequence > 90 && sequence % 61 === 0 ? { id: sequence - 90, text: `Запись ${sequence - 90}`, author: specialist } : null, forwardedFromId: null, rating: null, attachments: [], reactions: [] };
  });
}

export function fixtureHistoryPage(history: HelpMessage[], query: HelpHistoryQuery = {}) {
  const limit = Math.max(1, Math.min(100, query.limit ?? QA_HISTORY_PAGE_SIZE));
  let start = Math.max(0, history.length - limit), end = history.length;
  if (query.before !== undefined) {
    end = history.findIndex(message => message.sequence >= query.before!);
    if (end < 0) end = history.length;
    start = Math.max(0, end - limit);
  } else if (query.after !== undefined) {
    start = history.findIndex(message => message.sequence > query.after!);
    if (start < 0) start = history.length;
    end = Math.min(history.length, start + limit);
  } else if (query.around !== undefined || query.aroundMessageId !== undefined) {
    const index = history.findIndex(message => query.aroundMessageId !== undefined ? message.id === query.aroundMessageId : message.sequence === query.around);
    if (index < 0) throw new Error('Сообщение не найдено');
    start = Math.max(0, index - Math.floor(limit / 2));
    end = Math.min(history.length, start + limit);
    start = Math.max(0, end - limit);
  }
  return { messages: history.slice(start, end), hasOlder: start > 0, hasNewer: end < history.length };
}

export function searchFixtureHistory(history: HelpMessage[], query: string, before?: number): HelpSearchResult {
  const needle = query.trim().toLocaleLowerCase('ru-RU');
  if (!needle) return { messages: [], total: 0, nextCursor: null };
  const matches = history.filter(message => message.text.toLocaleLowerCase('ru-RU').includes(needle)).reverse();
  const remaining = before === undefined ? matches : matches.filter(message => message.sequence < before);
  const messages = remaining.slice(0, 20);
  return { messages, total: matches.length, nextCursor: remaining.length > messages.length ? messages.at(-1)!.sequence : null };
}

export function findFixtureDateMessage(history:HelpMessage[],date:string){
  const bounds=helpLocalDayBounds(date),from=Date.parse(bounds.from),to=Date.parse(bounds.to);
  const message=history.filter(message=>{const at=Date.parse(message.createdAt);return at>=from&&at<to;}).sort((a,b)=>a.sequence-b.sequence)[0];
  return message?{messageId:message.id,sequence:message.sequence}:null;
}
