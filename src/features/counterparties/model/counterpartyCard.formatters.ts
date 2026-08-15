export function formatCounterpartyMoney(value: number | null | undefined, currency = 'RUB') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const suffix = !currency || currency.toUpperCase() === 'RUB' ? '₽' : currency.toUpperCase();
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${suffix}`;
}

export function formatCounterpartyDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU');
}

export function formatCounterpartyPercent(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

export function formatCounterpartySalesChange(
  current: number | null | undefined,
  previous: number | null | undefined,
  change: number | null | undefined
) {
  if (typeof change === 'number' && Number.isFinite(change)) return formatCounterpartyPercent(change);
  if ((current || 0) > 0 && (previous || 0) === 0) return 'Нет данных';
  return '—';
}

export function valueOrDash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}
