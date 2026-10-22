import React from 'react';
import type { StockMovement, StockPage } from './products';
import { movementRangeComplete, type SalesPeriod } from './salesAnalytics';

type History = { page: StockPage<StockMovement> | null; busy: boolean; error: string | null; loadMore: () => unknown };
export function useSalesRange(history: History, period: SalesPeriod, scope: string, enabled: boolean) {
  const [failure, setFailure] = React.useState<{ scope: string; message: string } | null>(null);
  const guard = React.useRef<{ scope: string; page: StockPage<StockMovement> | null; cursors: Set<string>; pages: number }>({ scope: '', page: null, cursors: new Set(), pages: 0 });
  const complete = movementRangeComplete(history.page, period);
  React.useEffect(() => {
    const page = history.page;
    if (guard.current.scope !== scope || !page || (guard.current.page && page.items.length < guard.current.page.items.length)) {
      guard.current = { scope, page: null, cursors: new Set(), pages: 0 };
      setFailure(null);
    }
    if (!enabled || !page || history.busy || history.error || complete || failure?.scope === scope || guard.current.page === page) return;
    const cursor = page.nextCursor;
    if (!cursor || guard.current.cursors.has(cursor) || guard.current.pages >= 100) {
      setFailure({ scope, message: 'Не удалось загрузить весь период. Выберите более короткий период или обновите список.' });
      return;
    }
    guard.current.page = page;
    guard.current.cursors.add(cursor);
    guard.current.pages++;
    void history.loadMore();
  }, [enabled, scope, history.page, history.busy, history.error, history.loadMore, complete, failure]);
  return { complete, error: failure?.scope === scope ? failure.message : history.error };
}
