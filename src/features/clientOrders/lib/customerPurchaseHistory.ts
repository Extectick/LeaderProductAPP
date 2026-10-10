export type CustomerPurchaseHistory = {
  version: 'customer-purchases-v1';
  counterpartyGuid: string;
  organizationGuid: string;
  coverageFrom: string;
  asOf: string;
  fetchedAt: string;
  items: { productGuid: string; lastPurchasedDate: string }[];
};

function calendarDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() / 86400000 : NaN;
}

export function purchaseHistoryLabel(value?: string | null, now = new Date()) {
  if (!value) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
  const days = today - calendarDay(value);
  if (!Number.isFinite(days) || days < 0) return null;
  return days === 0 ? 'Брал сегодня' : `Брал ${days} дн. назад`;
}

export function isPurchaseHistory(value: any, counterpartyGuid: string, organizationGuid: string): value is CustomerPurchaseHistory {
  if (!value || value.version !== 'customer-purchases-v1' || value.counterpartyGuid !== counterpartyGuid
    || value.organizationGuid !== organizationGuid || !Number.isFinite(calendarDay(value.coverageFrom))
    || typeof value.asOf !== 'string' || !Number.isFinite(calendarDay(value.asOf.slice(0, 10)))
    || !Number.isFinite(Date.parse(value.fetchedAt)) || !Array.isArray(value.items) || value.items.length > 20000) return false;
  const seen = new Set<string>();
  return value.items.every((item: any) => {
    if (!item || typeof item.productGuid !== 'string' || !item.productGuid || seen.has(item.productGuid)
      || !Number.isFinite(calendarDay(item.lastPurchasedDate)) || item.lastPurchasedDate < value.coverageFrom
      || item.lastPurchasedDate > value.asOf.slice(0, 10)) return false;
    seen.add(item.productGuid);
    return true;
  });
}
