import type { OnecLpAppRoutePoint } from '@/utils/onecLpAppService';
import React from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';
import ReorderableList, { useIsActive, useReorderableDrag } from 'react-native-reorderable-list';

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
  listHeaderComponent?: React.ReactElement | null;
  listFooterComponent?: React.ReactElement | null;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  onContentSizeChange?: (width: number, height: number) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
  renderItem: (
    point: OnecLpAppRoutePoint,
    index: number,
    dragHandleProps?: RouteDragHandleProps
  ) => React.ReactNode;
};

type ReorderableRoutePointProps = {
  item: OnecLpAppRoutePoint;
  index: number;
  disabled: boolean;
  renderItem: RoutePointSortableListProps['renderItem'];
};

function ReorderableRoutePoint({ item, index, disabled, renderItem }: ReorderableRoutePointProps) {
  const drag = useReorderableDrag();
  const isActive = useIsActive();

  return (
    <>
      {renderItem(item, index, {
        listeners: disabled
          ? undefined
          : {
              onPressIn: drag,
              onLongPress: drag,
            },
        isDragging: isActive,
      })}
    </>
  );
}

export default function RoutePointSortableList({
  route,
  editing,
  saving,
  getItemId,
  onMove,
  listHeaderComponent,
  listFooterComponent,
  style,
  contentContainerStyle,
  scrollEnabled = true,
  showsVerticalScrollIndicator = false,
  onContentSizeChange,
  renderItem,
}: RoutePointSortableListProps) {
  const disabled = !editing || !!saving;

  return (
    <ReorderableList
      data={route}
      keyExtractor={(point, index) => getItemId(point, index)}
      scrollEnabled={scrollEnabled}
      dragEnabled={!disabled}
      shouldUpdateActiveItem
      autoscrollThreshold={0.28}
      autoscrollThresholdOffset={{ start: 72, end: 72 }}
      autoscrollSpeedScale={2.2}
      autoscrollActivationDelta={2}
      animationDuration={160}
      style={[{ width: '100%' }, style]}
      contentContainerStyle={[{ width: '100%' }, contentContainerStyle]}
      ListHeaderComponent={listHeaderComponent}
      ListFooterComponent={listFooterComponent}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={onContentSizeChange}
      onReorder={({ from, to }) => {
        if (from === to) return;
        onMove(from, to);
      }}
      renderItem={({ item, index }) => {
        const stableIndex = index ?? route.indexOf(item);
        return (
          <ReorderableRoutePoint
            item={item}
            index={stableIndex < 0 ? 0 : stableIndex}
            disabled={disabled}
            renderItem={renderItem}
          />
        );
      }}
    />
  );
}
