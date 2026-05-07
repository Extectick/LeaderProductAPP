import React from 'react';
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
};

export default function TransportTasksMobileRouteList({
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
        editing={false}
        saving={routeOrderSaving}
        getItemId={(point) => point.linkKey}
        onMove={onMoveRoutePoint}
        renderItem={(point, index, dragHandleProps) => (
          <RoutePointListItem
            point={point}
            index={index}
            total={routeForView.length}
            selected={selectedRoutePointIndex === index}
            editing={routeOrderEditing}
            saving={routeOrderSaving}
            compact
            showDragHandle={false}
            dragHandleProps={dragHandleProps}
            onPress={() => {
              onSelectRoutePointIndex(index);
              onAfterSelectPoint?.();
            }}
            onMoveTo={onMoveRoutePointToPosition}
          />
        )}
      />
      <View style={styles.routeListEndSpacer} />
    </>
  );
}
