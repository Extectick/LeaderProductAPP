import type { OnecLpAppRoutePoint, OnecLpAppTransportTask } from '@/utils/onecLpAppService';
import { useTabBarVisibility } from '@/components/Navigation/TabBarVisibilityContext';
import { useNavigation } from 'expo-router';
import type { TransportTaskCoordinatePoint, TransportTaskDeparturePoint } from '../types';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import TransportTasksMobileSheet from '../mobile/TransportTasksMobileSheet';
import TransportRouteMap from '../TransportRouteMap';
import { styles } from './styles';

type Props = {
  tint: string;
  selectedTask: OnecLpAppTransportTask | null;
  selectedRoutePointIndex: number | null;
  error: string | null;
  tasksLoading: boolean;
  tasksLoadingMore: boolean;
  taskDetailLoading: boolean;
  tasks: OnecLpAppTransportTask[];
  tasksHasMore: boolean;
  taskStatusFilter: string | null;
  routeOrderEditing: boolean;
  routeOrderEditable: boolean;
  routeOrderSaving: boolean;
  toLoadingSaving: boolean;
  routeForView: OnecLpAppRoutePoint[];
  hasRouteOrderChanges: boolean;
  canSubmitToLoading: boolean;
  focusDepartureCounter: number;
  departureSettingsSaving: boolean;
  departurePoint: TransportTaskDeparturePoint | null;
  departureMapSelectionMode: boolean;
  draftDepartureMapPoint: TransportTaskCoordinatePoint | null;
  onBack: () => void;
  onOpenDepartureSelection: () => void;
  onSaveRouteOrder: () => void;
  onOpenToLoadingConfirm: () => void;
  onOptimizeRouteOrder: () => void;
  onRefreshTasks: () => void;
  onTaskStatusFilterChange: (status: string | null) => void;
  onOpenTask: (task: OnecLpAppTransportTask) => void;
  onLoadMoreTasks: () => void;
  onSelectRoutePointIndex: (index: number | null) => void;
  onMoveRoutePoint: (fromIndex: number, toIndex: number) => void;
  onMoveRoutePointToPosition: (fromIndex: number, position: number) => void;
  onFocusDepartureOnMap: () => void;
  onHandleDepartureMapPick: (point: TransportTaskCoordinatePoint) => void;
  onSaveManualDeparturePoint: () => void;
  onCancelDepartureMapSelection: () => void;
};

export default function TransportTasksMobileLayout({
  tint,
  selectedTask,
  selectedRoutePointIndex,
  error,
  tasksLoading,
  tasksLoadingMore,
  taskDetailLoading,
  tasks,
  tasksHasMore,
  taskStatusFilter,
  routeOrderEditing,
  routeOrderEditable,
  routeOrderSaving,
  toLoadingSaving,
  routeForView,
  hasRouteOrderChanges,
  canSubmitToLoading,
  focusDepartureCounter,
  departureSettingsSaving,
  departurePoint,
  departureMapSelectionMode,
  draftDepartureMapPoint,
  onBack,
  onOpenDepartureSelection,
  onSaveRouteOrder,
  onOpenToLoadingConfirm,
  onOptimizeRouteOrder,
  onRefreshTasks,
  onTaskStatusFilterChange,
  onOpenTask,
  onLoadMoreTasks,
  onSelectRoutePointIndex,
  onMoveRoutePoint,
  onMoveRoutePointToPosition,
  onFocusDepartureOnMap,
  onHandleDepartureMapPick,
  onSaveManualDeparturePoint,
  onCancelDepartureMapSelection,
}: Props) {
  const navigation = useNavigation<any>();
  const { setHidden: setTabBarHidden } = useTabBarVisibility();
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
  const [collapseRequestId, setCollapseRequestId] = useState(0);
  const [focusSelectedCounter, setFocusSelectedCounter] = useState(0);
  const [positionNumberEditing, setPositionNumberEditing] = useState(false);
  const lastFocusDepartureCounterRef = useRef(focusDepartureCounter);

  const handleSelectRoutePointIndex = (index: number | null) => {
    onSelectRoutePointIndex(index);
    if (index !== null) {
      setFocusSelectedCounter((current) => current + 1);
    }
  };

  useEffect(() => {
    if (focusDepartureCounter === lastFocusDepartureCounterRef.current) return;
    lastFocusDepartureCounterRef.current = focusDepartureCounter;
    setCollapseRequestId((current) => current + 1);
  }, [focusDepartureCounter]);

  useEffect(() => {
    const unsubscribe = navigation.addListener?.('beforeRemove', (event: any) => {
      if (!bottomSheetExpanded) return;
      event.preventDefault();
      setCollapseRequestId((current) => current + 1);
    });
    return unsubscribe;
  }, [bottomSheetExpanded, navigation]);

  useEffect(() => {
    setTabBarHidden(positionNumberEditing);
    return () => setTabBarHidden(false);
  }, [positionNumberEditing, setTabBarHidden]);

  return (
    <View style={styles.mobileFullMapRoot}>
      <View style={styles.mobileFullMapLayer}>
        <TransportRouteMap
          route={routeForView}
          departurePoint={departurePoint}
          draftDeparturePoint={draftDepartureMapPoint}
          height="100%"
          selectedIndex={selectedRoutePointIndex}
          onSelectIndex={handleSelectRoutePointIndex}
          editing={routeOrderEditing}
          saving={routeOrderSaving}
          onMoveToPosition={onMoveRoutePointToPosition}
          departurePickMode={departureMapSelectionMode}
          onPickDeparturePoint={onHandleDepartureMapPick}
          onPressDeparturePoint={departureMapSelectionMode ? undefined : onOpenDepartureSelection}
          onMapTap={() => {
            if (!bottomSheetExpanded) return;
            setCollapseRequestId((current) => current + 1);
          }}
          focusSelectedCounter={focusSelectedCounter}
          focusDepartureCounter={focusDepartureCounter}
          showHeader={false}
          framed={false}
        />
      </View>
      <View pointerEvents="none" style={styles.mobileFullMapTint} />

      <TransportTasksMobileSheet
        tint={tint}
        onExpandedChange={setBottomSheetExpanded}
        collapseRequestId={collapseRequestId}
        onPositionEditFocusChange={setPositionNumberEditing}
        positionNumberEditing={positionNumberEditing}
        selectedTask={selectedTask}
        selectedRoutePointIndex={selectedRoutePointIndex}
        error={error}
        tasksLoading={tasksLoading}
        tasksLoadingMore={tasksLoadingMore}
        taskDetailLoading={taskDetailLoading}
        tasks={tasks}
        tasksHasMore={tasksHasMore}
        taskStatusFilter={taskStatusFilter}
        routeOrderEditing={routeOrderEditing}
        routeOrderEditable={routeOrderEditable}
        routeOrderSaving={routeOrderSaving}
        toLoadingSaving={toLoadingSaving}
        routeForView={routeForView}
        hasRouteOrderChanges={hasRouteOrderChanges}
        canSubmitToLoading={canSubmitToLoading}
        focusDepartureCounter={focusDepartureCounter}
        departureSettingsSaving={departureSettingsSaving}
        departurePoint={departurePoint}
        departureMapSelectionMode={departureMapSelectionMode}
        draftDepartureMapPoint={draftDepartureMapPoint}
        onBack={onBack}
        onOpenDepartureSelection={onOpenDepartureSelection}
        onSaveRouteOrder={onSaveRouteOrder}
        onOpenToLoadingConfirm={onOpenToLoadingConfirm}
        onOptimizeRouteOrder={onOptimizeRouteOrder}
        onRefreshTasks={onRefreshTasks}
        onTaskStatusFilterChange={onTaskStatusFilterChange}
        onOpenTask={onOpenTask}
        onLoadMoreTasks={onLoadMoreTasks}
        onSelectRoutePointIndex={handleSelectRoutePointIndex}
        onMoveRoutePoint={onMoveRoutePoint}
        onMoveRoutePointToPosition={onMoveRoutePointToPosition}
        onFocusDepartureOnMap={onFocusDepartureOnMap}
        onHandleDepartureMapPick={onHandleDepartureMapPick}
        onSaveManualDeparturePoint={onSaveManualDeparturePoint}
        onCancelDepartureMapSelection={onCancelDepartureMapSelection}
      />
    </View>
  );
}
