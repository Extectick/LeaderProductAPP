import { StockCompactMovementRow } from './StockReceiptRow';

export function movementDate(date: string) {
  const [year, month, day] = date.slice(0, 10).split('-');
  return year && month && day ? `${day}.${month}.${year.slice(-2)}` : '—';
}

// Share compact layout and interactions between the two movement tabs.
export const StockMovementRow = StockCompactMovementRow;
