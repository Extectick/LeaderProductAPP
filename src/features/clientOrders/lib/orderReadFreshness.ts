import type {ClientOrder, ClientOrdersTodaySummary} from '@/utils/clientOrdersService';
function time(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU') : null;
}
export function summaryFreshnessHint(summary?: ClientOrdersTodaySummary | null) {
  if (!summary?.stale) return null;
  const at = time(summary.fetchedAt || summary.calculatedAt);
  return `Предыдущие данные${at ? ` на ${at}` : ''}${summary.refreshPending ? '. Обновляются' : '. Требуется обновление'}`;
}
export function orderProfitFreshnessHint(order: ClientOrder) {
  if (order.profitFreshness?.status !== 'stale' || !order.profitAvailable || order.profit == null) return null;
  const at = time(order.profitFreshness.checkedAt);
  return `Предыдущий расчёт прибыли${at ? ` на ${at}` : ''}${order.profitFreshness.refreshPending ? '. Обновляется' : '. Требуется обновление'}`;
}
