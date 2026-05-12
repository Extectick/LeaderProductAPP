import type { OnecLpAppRoutePoint } from '@/utils/onecLpAppService';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import React, { useMemo } from 'react';
import type { RouteDragHandleProps, RoutePointSortableListProps } from './RoutePointSortableList';

const restrictRouteDragToVerticalAxis = ({ transform }: { transform: any }) => ({
  ...transform,
  x: 0,
});

function SortableRoutePoint({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (dragHandleProps: RouteDragHandleProps) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
        opacity: isDragging ? 0.72 : 1,
        position: 'relative',
        zIndex: isDragging ? 10 : 0,
        touchAction: 'auto',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {children({
        attributes,
        listeners,
        setActivatorNodeRef,
        isDragging,
      })}
    </div>
  );
}

export default function RoutePointSortableList({
  route,
  editing,
  saving,
  getItemId,
  onMove,
  renderItem,
}: RoutePointSortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const itemIds = useMemo(() => route.map((point, index) => getItemId(point, index)), [getItemId, route]);
  const disabled = !editing || saving;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = itemIds.indexOf(String(active.id));
    const toIndex = itemIds.indexOf(String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;
    onMove(fromIndex, toIndex);
  };

  if (disabled) {
    return (
      <>
        {route.map((point, index) => (
          <React.Fragment key={itemIds[index]}>{renderItem(point, index)}</React.Fragment>
        ))}
      </>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictRouteDragToVerticalAxis]}
      onDragEnd={handleDragEnd}
      autoScroll
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy} disabled={disabled}>
        {route.map((point, index) => {
          const id = itemIds[index];
          return (
            <SortableRoutePoint key={id} id={id} disabled={disabled}>
              {(dragHandleProps) => renderItem(point, index, dragHandleProps)}
            </SortableRoutePoint>
          );
        })}
      </SortableContext>
    </DndContext>
  );
}
