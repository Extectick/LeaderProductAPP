import { startOrderPerformance } from '@/src/shared/monitoring/orderPerformance';
import { createContext, useContext, useLayoutEffect, useRef, useEffect } from 'react';

export type OrderLoopStage =
  | 'unknown' | 'orders' | 'editor-header' | 'editor-items' | 'line-editor'
  | 'product-picker' | 'reference-picker' | 'linked-order' | 'filters' | 'web-workspace';

// Scoped to the mounted route. Updating a diagnostic must never render the screen.
export const OrderLoopStageContext = createContext<((stage: OrderLoopStage) => void) | null>(null);

export function useOrderLoopStage(stage: OrderLoopStage | null, ownerId?: number | null) {
  const record = useContext(OrderLoopStageContext);
  const current = useRef<OrderLoopStage>('unknown');
  useEffect(() => ownerId ? startOrderPerformance(ownerId, () => current.current) : undefined, [ownerId]);
  useLayoutEffect(() => {
    if (stage !== null) current.current = stage;
    if (stage !== null) record?.(stage);
    // Retain the last committed stage when React unmounts a failed subtree.
  }, [record, stage]);
}
