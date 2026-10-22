export const STOCK_TABS = [
  {value: 'balances', label: 'Остатки'},
  {value: 'receipt', label: 'Поступления'},
  {value: 'expense', label: 'Продажи'},
] as const;
export type StockTab = typeof STOCK_TABS[number]['value'];
export type StockSwipe = {translationX: number; translationY: number; velocityX: number; velocityY: number};

// Match the deliberate horizontal gesture used by the client-order document pager.
export function stockSwipeTarget(current: number, event: StockSwipe) {
  const x = Math.abs(event.translationX), y = Math.abs(event.translationY);
  const vx = Math.abs(event.velocityX), vy = Math.abs(event.velocityY);
  if (!(x >= 46 && x >= y * 1.8) && !(vx >= 720 && vx >= vy * 1.55)) return current;
  return Math.max(0, Math.min(STOCK_TABS.length - 1, current + (event.translationX < 0 ? 1 : event.translationX > 0 ? -1 : 0)));
}
