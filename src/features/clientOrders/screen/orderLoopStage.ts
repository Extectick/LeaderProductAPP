import { createContext, useContext, useLayoutEffect } from 'react';

export type OrderLoopStage =
  | 'unknown' | 'orders' | 'editor-header' | 'editor-items' | 'line-editor'
  | 'product-picker' | 'reference-picker' | 'linked-order' | 'filters' | 'web-workspace';

// Scoped to the mounted route. Updating a diagnostic must never render the screen.
export const OrderLoopStageContext = createContext<((stage: OrderLoopStage) => void) | null>(null);

export function useOrderLoopStage(stage: OrderLoopStage | null) {
  const record = useContext(OrderLoopStageContext);
  useLayoutEffect(() => {
    if (stage !== null) record?.(stage);
    // Retain the last committed stage when React unmounts a failed subtree.
  }, [record, stage]);
}
