import type { StockMovement, StockPage } from './products';

export type SalesPeriod = { from: string; to: string };
export type SalesPreset = 'week' | 'month' | 'current' | 'previous';
export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function salesPeriod(preset: SalesPreset = 'current', now = new Date()): SalesPeriod {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  if (preset === 'week' || preset === 'month') start.setDate(start.getDate() - (preset === 'week' ? 6 : 29));
  if (preset === 'current') start.setDate(1);
  if (preset === 'previous') { start.setMonth(start.getMonth() - 1, 1); end.setDate(0); }
  return { from: dayKey(start), to: dayKey(end) };
}
export function periodLabel(period: SalesPeriod) {
  const format = (day: string) => `${Number(day.slice(8))}.${day.slice(5, 7)}`;
  return `${format(period.from)}–${format(period.to)}`;
}
export function inSalesPeriod(item: StockMovement, period: SalesPeriod) {
  const day = item.movementAt?.slice(0, 10);
  return !!day && day >= period.from && day <= period.to;
}
export function isSale(item: StockMovement) {
  if (item.direction !== 'expense') return false;
  // Physical warehouse expenses also include transfers, writeoffs and returns.
  // Accept an unambiguous realization, never an order or an arbitrary expense.
  const docs = [item.document, ...item.baseDocuments];
  if (docs.some(doc => /Перемещение|Списание|Возврат/.test(doc.type))) return false;
  return item.document.type === 'РеализацияТоваровУслуг'
    || (item.baseDocuments.length > 0 && item.baseDocuments.every(doc => doc.type === 'РеализацияТоваровУслуг'))
    || /^Реализация товаров/i.test(item.operationKind);
}
export type SalesPoint = { day: string; quantity: number; documents: StockMovement[] };
export function salesCurrency(currency: string) {
  const value = currency.trim().toUpperCase();
  return /^(643|RUB|RUR|РУБ\.?|РУБЛЬ|РОССИЙСКИЙ РУБЛЬ|₽)$/.test(value) ? '₽' : value;
}
/** A day with any unknown price is a gap, not a biased average of known rows. */
export function salesDayPrice(point: SalesPoint, currency: string): number | null {
  if (!currency || !point.documents.length || point.documents.some(row => row.price === null || !Number.isFinite(row.price) || row.price < 0 || salesCurrency(row.currency) !== currency)) return null;
  return point.documents.reduce((sum, row) => sum + row.price! * row.quantity, 0) / point.quantity;
}
export function salesPoints(items: StockMovement[], period: SalesPeriod): SalesPoint[] {
  const points = new Map<string, SalesPoint>();
  const [y, m, d] = period.from.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Presets are at most 31 days. Guard invalid input before allocating points.
  for (let i = 0; i < 366 && dayKey(date) <= period.to; i++, date.setDate(date.getDate() + 1)) {
    const day = dayKey(date); points.set(day, { day, quantity: 0, documents: [] });
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id) || !isSale(item) || !inSalesPeriod(item, period) || !Number.isFinite(item.quantity) || item.quantity <= 0) continue;
    seen.add(item.id);
    const point = points.get(item.movementAt.slice(0, 10));
    if (point) { point.quantity += item.quantity; point.documents.push(item); }
  }
  return [...points.values()];
}
export function movementRangeComplete(page: StockPage<StockMovement> | null, period: SalesPeriod) {
  if (!page) return false;
  // The existing 1C cursor contract is descending, frozen at snapshotAt.
  return !page.hasMore || page.items.some(row => row.movementAt?.slice(0, 10) < period.from);
}
