import React from 'react';
import { Platform, ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ActivityIndicator, Button, List, Text } from 'react-native-paper';
import DepartureRoutePointListItem from '../components/DepartureRoutePointListItem';
import TaskListItem from '../components/TaskListItem';
import { transportTaskStatusNotice } from '../lib/formatters';
import { mobileSheetStyles as styles } from './styles';
import TransportTasksMobileRouteList from './TransportTasksMobileRouteList';
import TransportTasksMobileSheetToolbar from './TransportTasksMobileSheetToolbar';
import type { TransportTasksMobileSheetProps } from './types';

const TASKS_LOAD_MORE_THRESHOLD = 260;
const mobileWebScrollStyle =
  Platform.OS === 'web'
    ? ({
        overflowX: 'hidden',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch',
      } as any)
    : null;

type Props = Omit<TransportTasksMobileSheetProps, 'onExpandedChange' | 'collapseRequestId'> & {
  expanded: boolean;
  bodyHeight: number;
  onAfterSelectPoint?: () => void;
  onBodyContentHeightChange?: (height: number) => void;
  onPositionEditFocusChange?: (editing: boolean) => void;
};

export default function TransportTasksMobileSheetContent({
  expanded,
  bodyHeight,
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
  onSaveManualDeparturePoint,
  onCancelDepartureMapSelection,
  onAfterSelectPoint,
  onBodyContentHeightChange,
  onPositionEditFocusChange,
}: Props) {
  const selectedTaskNotice = transportTaskStatusNotice(selectedTask?.status);
  const [toolbarBlockHeight, setToolbarBlockHeight] = React.useState(0);
  const [activePositionEditingIndex, setActivePositionEditingIndex] = React.useState<number | null>(null);

  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (selectedTask || !tasksHasMore || tasksLoadingMore || tasksLoading) return;

      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceToEnd = contentSize.height - (contentOffset.y + layoutMeasurement.height);

      if (distanceToEnd <= TASKS_LOAD_MORE_THRESHOLD) {
        onLoadMoreTasks();
      }
    },
    [onLoadMoreTasks, selectedTask, tasksHasMore, tasksLoading, tasksLoadingMore]
  );

  const handleToolbarLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setToolbarBlockHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  const handlePositionEditFocus = React.useCallback((index: number) => {
    setActivePositionEditingIndex(index);
    onPositionEditFocusChange?.(true);
  }, [onPositionEditFocusChange]);

  const handlePositionEditBlur = React.useCallback(() => {
    setActivePositionEditingIndex(null);
    onPositionEditFocusChange?.(false);
  }, [onPositionEditFocusChange]);

  const handleDeparturePress = React.useCallback(() => {
    onFocusDepartureOnMap();
    onAfterSelectPoint?.();
  }, [onAfterSelectPoint, onFocusDepartureOnMap]);

  const selectedTaskHeader = React.useMemo(
    () =>
      selectedTask ? (
        <View style={styles.routeListHeaderContent}>
          {hasRouteOrderChanges ? (
            <Text style={{ color: '#B45309', fontSize: 11, fontWeight: '700' }}>
              Есть несохраненные изменения
            </Text>
          ) : null}
          {selectedTaskNotice ? <Text style={styles.statusNoticeText}>{selectedTaskNotice}</Text> : null}
          {departurePoint && !departureMapSelectionMode ? (
            <DepartureRoutePointListItem
              point={departurePoint}
              selected={selectedRoutePointIndex === null}
              compact
              onPress={handleDeparturePress}
              onPressEdit={onOpenDepartureSelection}
            />
          ) : null}
        </View>
      ) : null,
    [
      departureMapSelectionMode,
      departurePoint,
      handleDeparturePress,
      hasRouteOrderChanges,
      onOpenDepartureSelection,
      selectedRoutePointIndex,
      selectedTask,
      selectedTaskNotice,
    ]
  );
  const routeListFooter = React.useMemo(() => <View style={styles.routeListEndSpacer} />, []);
  const routeContentPadding = React.useMemo(
    () => (activePositionEditingIndex !== null ? { paddingBottom: 96 } : null),
    [activePositionEditingIndex]
  );
  const nativeRouteListHeight = Math.max(1, Math.floor(bodyHeight - toolbarBlockHeight));

  if (selectedTask && Platform.OS !== 'web') {
    return (
      <View style={styles.contentRoot}>
        <View style={styles.toolbarSection} onLayout={handleToolbarLayout}>
          <TransportTasksMobileSheetToolbar
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
            compact
          />
          <View style={styles.divider} />
        </View>

        <TransportTasksMobileRouteList
          tint={tint}
          taskDetailLoading={taskDetailLoading}
          routeOrderEditing={routeOrderEditing}
          routeOrderSaving={routeOrderSaving}
          routeForView={routeForView}
          selectedRoutePointIndex={selectedRoutePointIndex}
          departureMapSelectionMode={departureMapSelectionMode}
          draftDepartureMapPoint={draftDepartureMapPoint}
          departureSettingsSaving={departureSettingsSaving}
          onMoveRoutePoint={onMoveRoutePoint}
          onMoveRoutePointToPosition={onMoveRoutePointToPosition}
          onSelectRoutePointIndex={onSelectRoutePointIndex}
          onSaveManualDeparturePoint={onSaveManualDeparturePoint}
          onCancelDepartureMapSelection={onCancelDepartureMapSelection}
          onAfterSelectPoint={onAfterSelectPoint}
          onPositionEditFocus={handlePositionEditFocus}
          onPositionEditBlur={handlePositionEditBlur}
          activePositionEditingIndex={activePositionEditingIndex}
          listHeaderComponent={selectedTaskHeader}
          listFooterComponent={routeListFooter}
          listStyle={[styles.scroll, { flex: 0, height: nativeRouteListHeight }]}
          listContentContainerStyle={[styles.scrollContent, routeContentPadding]}
          listScrollEnabled={expanded}
        />
      </View>
    );
  }

  return (
    <View style={styles.contentRoot}>
      <View style={styles.toolbarSection} onLayout={handleToolbarLayout}>
        <TransportTasksMobileSheetToolbar
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
          compact
        />
        <View style={styles.divider} />
      </View>

      <ScrollView
        style={[styles.scroll, mobileWebScrollStyle]}
        contentContainerStyle={[
          styles.scrollContent,
          routeContentPadding,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={expanded}
        nestedScrollEnabled
        onScroll={handleScroll}
        scrollEventThrottle={120}
        onContentSizeChange={(_width, height) => onBodyContentHeightChange?.(height + toolbarBlockHeight)}
      >
        {selectedTask ? (
          <>
            {selectedTaskHeader}
            <TransportTasksMobileRouteList
              tint={tint}
              taskDetailLoading={taskDetailLoading}
              routeOrderEditing={routeOrderEditing}
              routeOrderSaving={routeOrderSaving}
              routeForView={routeForView}
              selectedRoutePointIndex={selectedRoutePointIndex}
              departureMapSelectionMode={departureMapSelectionMode}
              draftDepartureMapPoint={draftDepartureMapPoint}
              departureSettingsSaving={departureSettingsSaving}
              onMoveRoutePoint={onMoveRoutePoint}
              onMoveRoutePointToPosition={onMoveRoutePointToPosition}
              onSelectRoutePointIndex={onSelectRoutePointIndex}
              onSaveManualDeparturePoint={onSaveManualDeparturePoint}
              onCancelDepartureMapSelection={onCancelDepartureMapSelection}
              onAfterSelectPoint={onAfterSelectPoint}
              onPositionEditFocus={handlePositionEditFocus}
              onPositionEditBlur={handlePositionEditBlur}
              activePositionEditingIndex={activePositionEditingIndex}
              listFooterComponent={routeListFooter}
            />
          </>
        ) : tasksLoading && !tasks.length ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 }}>
            <ActivityIndicator color={tint} />
            <Text style={{ color: '#64748B' }}>Загружаем задания</Text>
          </View>
        ) : error ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: '#B91C1C', fontWeight: '700' }}>{error}</Text>
            <Button mode="outlined" onPress={onRefreshTasks}>
              Повторить
            </Button>
          </View>
        ) : tasks.length ? (
          <>
            {tasks.map((task) => (
              <TaskListItem key={task.guid} task={task} onPress={() => onOpenTask(task)} />
            ))}
            {tasksLoadingMore ? <ActivityIndicator color={tint} style={styles.loadMoreIndicator} /> : null}
          </>
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 }}>
            <List.Icon icon="clipboard-text-outline" color="#94A3B8" />
            <Text style={{ color: '#0F172A', fontWeight: '800', textAlign: 'center' }}>
              Задания на перевозку не найдены
            </Text>
            <Text style={{ color: '#64748B', textAlign: 'center' }}>
              В 1С нет доступных заданий для текущего пользователя.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
