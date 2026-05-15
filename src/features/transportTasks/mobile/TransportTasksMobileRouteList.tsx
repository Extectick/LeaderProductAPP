import React from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import RoutePointSortableList from '../RoutePointSortableList';
import RoutePointListItem from '../components/RoutePointListItem';
import DepartureMapSelectionPanel from '../screen/DepartureMapSelectionPanel';
import { mobileSheetStyles as styles } from './styles';
import type { TransportTasksMobileSheetProps } from './types';

type Props = Pick<
  TransportTasksMobileSheetProps,
  | 'tint'
  | 'taskDetailLoading'
  | 'routeOrderEditing'
  | 'routeOrderSaving'
  | 'routeForView'
  | 'selectedRoutePointIndex'
  | 'departureMapSelectionMode'
  | 'draftDepartureMapPoint'
  | 'departureSettingsSaving'
  | 'onMoveRoutePoint'
  | 'onMoveRoutePointToPosition'
  | 'onSelectRoutePointIndex'
  | 'onSaveManualDeparturePoint'
  | 'onCancelDepartureMapSelection'
> & {
  onAfterSelectPoint?: () => void;
  onPositionEditFocus?: (index: number) => void;
  onPositionEditBlur?: () => void;
  activePositionEditingIndex?: number | null;
  listHeaderComponent?: React.ReactElement | null;
  listFooterComponent?: React.ReactElement | null;
  listStyle?: StyleProp<ViewStyle>;
  listContentContainerStyle?: StyleProp<ViewStyle>;
  listScrollEnabled?: boolean;
  onListContentSizeChange?: (width: number, height: number) => void;
  onListScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

function TransportTasksMobileRouteList({
  tint,
  taskDetailLoading,
  routeOrderEditing,
  routeOrderSaving,
  routeForView,
  selectedRoutePointIndex,
  departureMapSelectionMode,
  draftDepartureMapPoint,
  departureSettingsSaving,
  onMoveRoutePoint,
  onMoveRoutePointToPosition,
  onSelectRoutePointIndex,
  onSaveManualDeparturePoint,
  onCancelDepartureMapSelection,
  onAfterSelectPoint,
  onPositionEditFocus,
  onPositionEditBlur,
  activePositionEditingIndex,
  listHeaderComponent,
  listFooterComponent,
  listStyle,
  listContentContainerStyle,
  listScrollEnabled,
  onListContentSizeChange,
  onListScroll,
}: Props) {
  if (departureMapSelectionMode) {
    return (
      <DepartureMapSelectionPanel
        draftDepartureMapPoint={draftDepartureMapPoint}
        departureSettingsSaving={departureSettingsSaving}
        onSave={onSaveManualDeparturePoint}
        onCancel={onCancelDepartureMapSelection}
      />
    );
  }

  if (!routeForView.length) {
    if (taskDetailLoading) {
      return (
        <View style={styles.routeListEndSpacer}>
          <ActivityIndicator color={tint} />
        </View>
      );
    }

    return (
      <View style={styles.routeListEndSpacer}>
        <Text style={{ color: '#64748B' }}>В задании нет реальных точек маршрута.</Text>
      </View>
    );
  }

  return (
    <>
      <RoutePointSortableList
        route={routeForView}
        editing={routeOrderEditing}
        saving={routeOrderSaving}
        getItemId={(point) => point.linkKey}
        onMove={onMoveRoutePoint}
        listHeaderComponent={listHeaderComponent}
        listFooterComponent={listFooterComponent}
        style={listStyle}
        contentContainerStyle={listContentContainerStyle}
        scrollEnabled={listScrollEnabled}
        onContentSizeChange={onListContentSizeChange}
        onScroll={onListScroll}
        scrollEventThrottle={120}
        renderItem={(point, index, dragHandleProps) => (
          <RoutePointListItem
            point={point}
            index={index}
            total={routeForView.length}
            selected={selectedRoutePointIndex === index}
            editing={routeOrderEditing}
            saving={routeOrderSaving}
            compact
            showDragHandle={routeOrderEditing && activePositionEditingIndex === null}
            dragHandleProps={dragHandleProps}
            onPress={() => {
              onSelectRoutePointIndex(index);
              onAfterSelectPoint?.();
            }}
            onMoveTo={onMoveRoutePointToPosition}
            onPositionEditFocus={() => onPositionEditFocus?.(index)}
            onPositionEditBlur={onPositionEditBlur}
          />
        )}
      />
      {listFooterComponent ? null : <View style={styles.routeListEndSpacer} />}
    </>
  );
}

export default React.memo(TransportTasksMobileRouteList);
