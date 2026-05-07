import type { OnecLpAppRoutePoint } from '@/utils/onecLpAppService';
import React from 'react';

export type RouteDragHandleProps = {
  attributes?: Record<string, any>;
  listeners?: Record<string, any>;
  setActivatorNodeRef?: (node: any) => void;
  isDragging?: boolean;
};

export type RoutePointSortableListProps = {
  route: OnecLpAppRoutePoint[];
  editing?: boolean;
  saving?: boolean;
  getItemId: (point: OnecLpAppRoutePoint, index: number) => string;
  onMove: (fromIndex: number, toIndex: number) => void;
  renderItem: (
    point: OnecLpAppRoutePoint,
    index: number,
    dragHandleProps?: RouteDragHandleProps
  ) => React.ReactNode;
};

export default function RoutePointSortableList({ route, getItemId, renderItem }: RoutePointSortableListProps) {
  return (
    <>
      {route.map((point, index) => (
        <React.Fragment key={getItemId(point, index)}>{renderItem(point, index)}</React.Fragment>
      ))}
    </>
  );
}
