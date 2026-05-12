import type { OnecLpAppRoutePoint } from '@/utils/onecLpAppService';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';

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

type ItemLayout = {
  y: number;
  height: number;
};

function resolveDropIndex(
  itemIds: string[],
  layouts: Record<string, ItemLayout>,
  activeId: string,
  translationY: number
) {
  const activeLayout = layouts[activeId];
  const currentIndex = itemIds.indexOf(activeId);
  if (!activeLayout || currentIndex < 0) return currentIndex;

  const activeCenter = activeLayout.y + activeLayout.height / 2 + translationY;
  let nextIndex = currentIndex;

  for (let index = 0; index < itemIds.length; index += 1) {
    const itemId = itemIds[index];
    const layout = layouts[itemId];
    if (!layout) continue;

    const midpoint = layout.y + layout.height / 2;
    if (activeCenter < midpoint) {
      return index;
    }
    nextIndex = index;
  }

  return nextIndex;
}

function NativeSortableRoutePoint({
  id,
  disabled,
  isDragging,
  onDragStart,
  onDragEnd,
  onMeasure,
  children,
}: {
  id: string;
  disabled: boolean;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, translationY: number) => void;
  onMeasure: (id: string, event: LayoutChangeEvent) => void;
  children: (dragHandleProps?: RouteDragHandleProps) => React.ReactNode;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const dragArmedRef = useRef(false);
  const responderActiveRef = useRef(false);

  const finishDrag = useCallback(
    (translationYValue: number) => {
      dragArmedRef.current = false;
      responderActiveRef.current = false;
      Animated.spring(translateY, {
        toValue: 0,
        damping: 20,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
      onDragEnd(id, translationYValue);
    },
    [id, onDragEnd, translateY]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: () => dragArmedRef.current,
        onMoveShouldSetPanResponderCapture: () => dragArmedRef.current,
        onPanResponderGrant: () => {
          responderActiveRef.current = true;
          translateY.setValue(0);
        },
        onPanResponderMove: (_event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          if (!responderActiveRef.current) return;
          translateY.setValue(gestureState.dy);
        },
        onPanResponderRelease: (_event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          if (!dragArmedRef.current && !responderActiveRef.current) return;
          finishDrag(gestureState.dy);
        },
        onPanResponderTerminate: (_event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          if (!dragArmedRef.current && !responderActiveRef.current) return;
          finishDrag(gestureState.dy);
        },
      }),
    [finishDrag, translateY]
  );

  const animatedStyle = {
    transform: [{ translateY }],
    zIndex: isDragging ? 20 : 0,
    opacity: isDragging ? 0.94 : 1,
  } as const;

  if (disabled) {
    return (
      <View onLayout={(event) => onMeasure(id, event)} style={{ width: '100%' }}>
        {children()}
      </View>
    );
  }

  return (
    <Animated.View
      onLayout={(event) => onMeasure(id, event)}
      style={[
        {
          width: '100%',
          shadowColor: '#0F172A',
          shadowOpacity: isDragging ? 0.16 : 0,
          shadowRadius: isDragging ? 12 : 0,
          shadowOffset: { width: 0, height: isDragging ? 8 : 0 },
          elevation: isDragging ? 8 : 0,
        },
        animatedStyle,
      ]}
    >
      {children({
        listeners: {
          ...panResponder.panHandlers,
          onLongPress: () => {
            dragArmedRef.current = true;
            translateY.setValue(0);
            onDragStart(id);
          },
          onPressOut: () => {
            if (!dragArmedRef.current || responderActiveRef.current) return;
            finishDrag(0);
          },
        },
        isDragging,
      })}
    </Animated.View>
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
  const itemIds = useMemo(() => route.map((point, index) => getItemId(point, index)), [getItemId, route]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [layouts, setLayouts] = useState<Record<string, ItemLayout>>({});
  const disabled = !editing || !!saving;

  const handleMeasure = useCallback((id: string, event: LayoutChangeEvent) => {
    const nextLayout = {
      y: event.nativeEvent.layout.y,
      height: event.nativeEvent.layout.height,
    };
    setLayouts((current) => {
      const prev = current[id];
      if (prev && prev.y === nextLayout.y && prev.height === nextLayout.height) return current;
      return { ...current, [id]: nextLayout };
    });
  }, []);

  const handleDragStart = useCallback((id: string) => {
    setDraggingId(id);
  }, []);

  const handleDragEnd = useCallback(
    (id: string, translationY: number) => {
      const fromIndex = itemIds.indexOf(id);
      const toIndex = resolveDropIndex(itemIds, layouts, id, translationY);
      setDraggingId((current) => (current === id ? null : current));
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      onMove(fromIndex, toIndex);
    },
    [itemIds, layouts, onMove]
  );

  return (
    <View style={{ width: '100%' }}>
      {route.map((point, index) => {
        const id = itemIds[index];
        return (
          <NativeSortableRoutePoint
            key={id}
            id={id}
            disabled={disabled}
            isDragging={draggingId === id}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onMeasure={handleMeasure}
          >
            {(dragHandleProps) => renderItem(point, index, dragHandleProps)}
          </NativeSortableRoutePoint>
        );
      })}
    </View>
  );
}
