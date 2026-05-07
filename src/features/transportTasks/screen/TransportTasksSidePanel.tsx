import type { OnecLpAppRoutePoint, OnecLpAppTransportTask } from '@/utils/onecLpAppService';
import type { TransportTaskCoordinatePoint, TransportTaskDeparturePoint } from '../types';
import React from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ActivityIndicator, Button, Card, List, Text } from 'react-native-paper';
import DepartureRoutePointListItem from '../components/DepartureRoutePointListItem';
import RoutePointListItem from '../components/RoutePointListItem';
import TaskListItem from '../components/TaskListItem';
import RoutePointSortableList from '../RoutePointSortableList';
import TransportRouteMap from '../TransportRouteMap';
import { transportTaskStatusNotice } from '../lib/formatters';
import DepartureMapSelectionPanel from './DepartureMapSelectionPanel';
import { styles } from './styles';
import TransportTasksToolbar from './TransportTasksToolbar';

const TASKS_LOAD_MORE_THRESHOLD = 320;
const sideScrollWebLockStyle = { overflowX: 'hidden' } as any;

type Props = {
  isDesktop: boolean;
  tint: string;
  showToolbar?: boolean;
  showInlineMap?: boolean;
  variant?: 'card' | 'plain';
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

export default function TransportTasksSidePanel({
  isDesktop,
  tint,
  showToolbar = true,
  showInlineMap = !isDesktop,
  variant = 'card',
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
  const selectedTaskNotice = transportTaskStatusNotice(selectedTask?.status);
  const handleTasksScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!tasksHasMore || tasksLoadingMore || tasksLoading) return;

      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceToEnd = contentSize.height - (contentOffset.y + layoutMeasurement.height);

      if (distanceToEnd <= TASKS_LOAD_MORE_THRESHOLD) {
        onLoadMoreTasks();
      }
    },
    [onLoadMoreTasks, tasksHasMore, tasksLoading, tasksLoadingMore]
  );

  const content = (
    <View style={variant === 'plain' ? styles.sideContentPlain : styles.sideContent}>
        {showToolbar ? (
          <TransportTasksToolbar
            selectedTask={selectedTask}
            routeCount={routeForView.length}
            hasRouteOrderChanges={hasRouteOrderChanges}
            routeOrderEditable={routeOrderEditable}
            routeOrderSaving={routeOrderSaving}
            toLoadingSaving={toLoadingSaving}
            canSubmitToLoading={canSubmitToLoading}
            tasksLoading={tasksLoading}
            departurePoint={departurePoint}
            taskStatusFilter={taskStatusFilter}
            onBack={onBack}
            onSaveRouteOrder={onSaveRouteOrder}
            onOpenToLoadingConfirm={onOpenToLoadingConfirm}
            onOptimizeRouteOrder={onOptimizeRouteOrder}
            onRefreshTasks={onRefreshTasks}
            onTaskStatusFilterChange={onTaskStatusFilterChange}
          />
        ) : null}

        {selectedTask ? (
          <>
            {hasRouteOrderChanges ? (
              <Text variant="bodySmall" style={styles.routeOrderDirtyText}>
                Есть несохраненные изменения
              </Text>
            ) : null}
            {selectedTaskNotice ? (
              <Text variant="bodySmall" style={styles.routeOrderStatusNotice}>
                {selectedTaskNotice}
              </Text>
            ) : null}
            <ScrollView
              style={[styles.sideScroll, sideScrollWebLockStyle]}
              contentContainerStyle={[styles.sideScrollContent, sideScrollWebLockStyle]}
            >
              {showInlineMap ? (
                <TransportRouteMap
                  route={routeForView}
                  departurePoint={departurePoint}
                  draftDeparturePoint={draftDepartureMapPoint}
                  height={260}
                  selectedIndex={selectedRoutePointIndex}
                  onSelectIndex={onSelectRoutePointIndex}
                  editing={routeOrderEditing}
                  saving={routeOrderSaving}
                  onMoveToPosition={onMoveRoutePointToPosition}
                  departurePickMode={departureMapSelectionMode}
                  onPickDeparturePoint={onHandleDepartureMapPick}
                  onPressDeparturePoint={departureMapSelectionMode ? undefined : onOpenDepartureSelection}
                  focusDepartureCounter={focusDepartureCounter}
                />
              ) : null}
              {!isDesktop && departureMapSelectionMode ? (
                <DepartureMapSelectionPanel
                  draftDepartureMapPoint={draftDepartureMapPoint}
                  departureSettingsSaving={departureSettingsSaving}
                  onSave={onSaveManualDeparturePoint}
                  onCancel={onCancelDepartureMapSelection}
                />
              ) : null}
              {departurePoint ? (
                <DepartureRoutePointListItem
                  point={departurePoint}
                  selected={selectedRoutePointIndex === null}
                  onPress={onFocusDepartureOnMap}
                  onPressEdit={onOpenDepartureSelection}
                />
              ) : null}
              {routeForView.length ? (
                <>
                  <RoutePointSortableList
                    route={routeForView}
                    editing={routeOrderEditing}
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
                        showDragHandle={isDesktop && routeOrderEditing}
                        dragHandleProps={dragHandleProps}
                        onPress={() => onSelectRoutePointIndex(index)}
                        onMoveTo={onMoveRoutePointToPosition}
                      />
                    )}
                  />
                  {!isDesktop ? <View style={styles.mobileRouteListEndSpacer} /> : null}
                </>
              ) : taskDetailLoading ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator color={tint} />
                  <Text variant="bodyMedium" style={styles.mutedText}>
                    Загружаем маршрут
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text variant="bodyMedium" style={styles.mutedText}>
                    В задании нет реальных точек маршрута.
                  </Text>
                </View>
              )}
            </ScrollView>
          </>
        ) : tasksLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={tint} />
            <Text variant="bodyMedium" style={styles.mutedText}>
              Загружаем задания
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Button mode="outlined" onPress={onRefreshTasks}>
              Повторить
            </Button>
          </View>
        ) : tasks.length ? (
          <ScrollView
            style={[styles.sideScroll, sideScrollWebLockStyle]}
            contentContainerStyle={[styles.sideScrollContent, sideScrollWebLockStyle]}
            onScroll={handleTasksScroll}
            scrollEventThrottle={120}
          >
            {tasks.map((task) => (
              <TaskListItem key={task.guid} task={task} onPress={() => onOpenTask(task)} />
            ))}
            {tasksLoadingMore ? <ActivityIndicator color={tint} style={styles.loadMoreIndicator} /> : null}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <List.Icon icon="clipboard-text-outline" color="#94A3B8" />
            <Text variant="titleMedium" style={styles.emptyTitle}>
              Задания на перевозку не найдены
            </Text>
            <Text variant="bodyMedium" style={styles.mutedText}>
              В 1С нет доступных заданий для текущего пользователя.
            </Text>
          </View>
        )}
    </View>
  );

  if (variant === 'plain') {
    return content;
  }

  return (
    <Card mode="outlined" style={styles.sideCard}>
      <Card.Content style={styles.sideCardContent}>{content}</Card.Content>
    </Card>
  );
}
