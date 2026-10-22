/** 1C may send the ruble as an ISO numeric code instead of RUB. */
export function stockMoney(value: number, currency: string) {
  const code = currency.trim();
  const label = /^(643|RUB|RUR|руб\.?|рубль|российский рубль|₽)$/i.test(code) ? '₽' : code;
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${label}`;
}
