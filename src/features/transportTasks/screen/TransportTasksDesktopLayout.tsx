import type { OnecLpAppRoutePoint, OnecLpAppTransportTask } from '@/utils/onecLpAppService';
import type { TransportTaskCoordinatePoint, TransportTaskDeparturePoint } from '../types';
import React from 'react';
import { View } from 'react-native';
import { List, Text } from 'react-native-paper';
import DepartureMapSelectionPanel from './DepartureMapSelectionPanel';
import TransportTasksSidePanel from './TransportTasksSidePanel';
import TransportRouteMap from '../TransportRouteMap';
import { styles } from './styles';

type Props = {
  desktopListPaneTop: number;
  headerBottomOffset: number;
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
  tint: string;
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

export default function TransportTasksDesktopLayout({
  desktopListPaneTop,
  headerBottomOffset,
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
  tint,
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
  return (
    <View style={styles.desktopLayout}>
      <View style={styles.desktopCenterPane}>
        <View style={styles.mapPane}>
          {selectedTask || departureMapSelectionMode ? (
            <>
              <TransportRouteMap
                route={routeForView}
                departurePoint={departurePoint}
                draftDeparturePoint={draftDepartureMapPoint}
                height="100%"
                selectedIndex={selectedRoutePointIndex}
                onSelectIndex={onSelectRoutePointIndex}
                editing={routeOrderEditing}
                saving={routeOrderSaving}
                onMoveToPosition={onMoveRoutePointToPosition}
                departurePickMode={departureMapSelectionMode}
                onPickDeparturePoint={onHandleDepartureMapPick}
                onPressDeparturePoint={departureMapSelectionMode ? undefined : onOpenDepartureSelection}
                focusDepartureCounter={focusDepartureCounter}
                showHeader={false}
                framed={false}
              />
              {departureMapSelectionMode ? (
                <View
                  style={[
                    styles.desktopMapSelectionOverlay,
                    { top: Math.max(headerBottomOffset + 16, 92) },
                  ]}
                >
                  <DepartureMapSelectionPanel
                    draftDepartureMapPoint={draftDepartureMapPoint}
                    departureSettingsSaving={departureSettingsSaving}
                    onSave={onSaveManualDeparturePoint}
                    onCancel={onCancelDepartureMapSelection}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.mapEmptyState}>
              <List.Icon icon="map-marker-path" color="#94A3B8" />
              <Text variant="titleMedium" style={styles.emptyTitle}>
                Выберите задание
              </Text>
              <Text variant="bodyMedium" style={styles.mutedText}>
                После выбора задания здесь появится карта маршрута с точкой отправления 0.
              </Text>
            </View>
          )}
        </View>
      </View>
      <View pointerEvents="none" style={styles.desktopMapTint} />
      <View style={[styles.desktopOverlayPane, { top: desktopListPaneTop }]}>
        <TransportTasksSidePanel
          isDesktop
          tint={tint}
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
          onSelectRoutePointIndex={onSelectRoutePointIndex}
          onMoveRoutePoint={onMoveRoutePoint}
          onMoveRoutePointToPosition={onMoveRoutePointToPosition}
          onFocusDepartureOnMap={onFocusDepartureOnMap}
          onHandleDepartureMapPick={onHandleDepartureMapPick}
          onSaveManualDeparturePoint={onSaveManualDeparturePoint}
          onCancelDepartureMapSelection={onCancelDepartureMapSelection}
        />
      </View>
    </View>
  );
}
