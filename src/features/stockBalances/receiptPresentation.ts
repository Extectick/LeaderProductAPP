import type { StockMovement } from './products';

export const movementDay = (item: StockMovement) => item.movementAt.slice(0, 10);
const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function movementDayLabel(day: string, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return 'Дата не указана';
  const [, year, month, date] = match;
  const localKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const prefix = day === localKey(now) ? 'Сегодня, ' : day === localKey(yesterday) ? 'Вчера, ' : '';
  return `${prefix}${Number(date)} ${months[Number(month) - 1]}${Number(year) === now.getFullYear() ? '' : ` ${year}`}`;
}

export function receiptPresentation(item: StockMovement) {
  const transfers = item.baseDocuments.filter(doc => doc.type === 'ПеремещениеТоваров');
  const transfer = item.document.type === 'ПеремещениеТоваров' || transfers.length > 0 || item.operationKind === 'Перемещение товаров';
  // 1C explicitly encodes the opposite warehouse for a transfer as "Из: ...".
  // Never interpret a supplier with the same prefix as a warehouse.
  const source = transfer ? /^Из:\s*(.+)$/u.exec(item.counterparty)?.[1].trim() : undefined;
  const document = transfer && transfers.length === 1 ? transfers[0] : item.document;
  const operation = transfer ? 'Перемещение' : /Приобретение|Поступление|Приходный ордер/i.test(item.operationKind || item.document.typeName)
    ? 'Поступление' : item.operationKind || item.document.typeName;
  return { transfer, source, document, operation };
}
