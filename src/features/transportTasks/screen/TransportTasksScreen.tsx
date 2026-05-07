import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { useNotificationViewport } from '@/context/NotificationViewportContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import React, { useMemo } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Portal, Snackbar, Text } from 'react-native-paper';
import useTransportTasksScreen from '../hooks/useTransportTasksScreen';
import DepartureSelectionDialog from './DepartureSelectionDialog';
import ToLoadingConfirmDialog from './ToLoadingConfirmDialog';
import TransportTasksBlockedState from './TransportTasksBlockedState';
import TransportTasksDesktopLayout from './TransportTasksDesktopLayout';
import TransportTasksMobileLayout from './TransportTasksMobileLayout';
import { styles } from './styles';

const WEB_DESKTOP_BREAKPOINT = 1024;

export default function TransportTasksScreen() {
  const controller = useTransportTasksScreen();
  const { width } = useWindowDimensions();
  const topInset = useHeaderContentTopInset();
  const { headerBottomOffset } = useNotificationViewport();
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');

  const isDesktop = Platform.OS === 'web' && width >= WEB_DESKTOP_BREAKPOINT;
  const desktopListPaneTop = useMemo(() => Math.max(headerBottomOffset + 4, 92), [headerBottomOffset]);

  if (controller.profileLoading && !controller.profile) {
    return (
      <View style={[styles.centerRoot, { backgroundColor: background, paddingTop: topInset }]}>
        <ActivityIndicator color={tint} />
        <Text style={styles.mutedText}>Загружаем профиль</Text>
      </View>
    );
  }

  if (!controller.employeeProfile || !controller.isLinked) {
    return (
      <TransportTasksBlockedState
        background={background}
        topInset={topInset}
        employeeProfileExists={Boolean(controller.employeeProfile)}
        error={controller.error}
        profileLoading={controller.profileLoading}
        onRefreshProfile={() => void controller.refreshProfile()}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      {isDesktop ? (
        <TransportTasksDesktopLayout
          desktopListPaneTop={desktopListPaneTop}
          headerBottomOffset={headerBottomOffset}
          selectedTask={controller.selectedTask}
          selectedRoutePointIndex={controller.selectedRoutePointIndex}
          error={controller.error}
          tasksLoading={controller.tasksLoading}
          tasksLoadingMore={controller.tasksLoadingMore}
          taskDetailLoading={controller.taskDetailLoading}
          tasks={controller.tasks}
          tasksHasMore={controller.tasksHasMore}
          taskStatusFilter={controller.taskStatusFilter}
          routeOrderEditing={controller.routeOrderEditing}
          routeOrderEditable={controller.routeOrderEditable}
          routeOrderSaving={controller.routeOrderSaving}
          toLoadingSaving={controller.toLoadingSaving}
          routeForView={controller.routeForView}
          hasRouteOrderChanges={controller.hasRouteOrderChanges}
          canSubmitToLoading={controller.canSubmitToLoading}
          focusDepartureCounter={controller.focusDepartureCounter}
          tint={tint}
          departureSettingsSaving={controller.departureSettingsSaving}
          departurePoint={controller.departurePoint}
          departureMapSelectionMode={controller.departureMapSelectionMode}
          draftDepartureMapPoint={controller.draftDepartureMapPoint}
          onBack={() => {
            controller.setSelectedTaskGuid(null);
            controller.setSelectedRoutePointIndex(null);
          }}
          onOpenDepartureSelection={controller.openDepartureSelection}
          onSaveRouteOrder={() => void controller.saveRouteOrder()}
          onOpenToLoadingConfirm={controller.openToLoadingConfirm}
          onOptimizeRouteOrder={controller.optimizeRouteOrder}
          onRefreshTasks={() => void controller.loadTasks()}
          onTaskStatusFilterChange={controller.setTaskStatusFilter}
          onOpenTask={(task) => void controller.openTask(task)}
          onLoadMoreTasks={() => void controller.loadMoreTasks()}
          onSelectRoutePointIndex={controller.setSelectedRoutePointIndex}
          onMoveRoutePoint={controller.moveRoutePoint}
          onMoveRoutePointToPosition={controller.moveRoutePointToPosition}
          onFocusDepartureOnMap={controller.focusDepartureOnMap}
          onHandleDepartureMapPick={controller.handleDepartureMapPick}
          onSaveManualDeparturePoint={() => void controller.saveManualMapDeparturePoint()}
          onCancelDepartureMapSelection={controller.cancelDepartureMapSelection}
        />
      ) : (
        <TransportTasksMobileLayout
          tint={tint}
          selectedTask={controller.selectedTask}
          selectedRoutePointIndex={controller.selectedRoutePointIndex}
          error={controller.error}
          tasksLoading={controller.tasksLoading}
          tasksLoadingMore={controller.tasksLoadingMore}
          taskDetailLoading={controller.taskDetailLoading}
          tasks={controller.tasks}
          tasksHasMore={controller.tasksHasMore}
          taskStatusFilter={controller.taskStatusFilter}
          routeOrderEditing={controller.routeOrderEditing}
          routeOrderEditable={controller.routeOrderEditable}
          routeOrderSaving={controller.routeOrderSaving}
          toLoadingSaving={controller.toLoadingSaving}
          routeForView={controller.routeForView}
          hasRouteOrderChanges={controller.hasRouteOrderChanges}
          canSubmitToLoading={controller.canSubmitToLoading}
          focusDepartureCounter={controller.focusDepartureCounter}
          departureSettingsSaving={controller.departureSettingsSaving}
          departurePoint={controller.departurePoint}
          departureMapSelectionMode={controller.departureMapSelectionMode}
          draftDepartureMapPoint={controller.draftDepartureMapPoint}
          onBack={() => {
            controller.setSelectedTaskGuid(null);
            controller.setSelectedRoutePointIndex(null);
          }}
          onOpenDepartureSelection={controller.openDepartureSelection}
          onSaveRouteOrder={() => void controller.saveRouteOrder()}
          onOpenToLoadingConfirm={controller.openToLoadingConfirm}
          onOptimizeRouteOrder={controller.optimizeRouteOrder}
          onRefreshTasks={() => void controller.loadTasks()}
          onTaskStatusFilterChange={controller.setTaskStatusFilter}
          onOpenTask={(task) => void controller.openTask(task)}
          onLoadMoreTasks={() => void controller.loadMoreTasks()}
          onSelectRoutePointIndex={controller.setSelectedRoutePointIndex}
          onMoveRoutePoint={controller.moveRoutePoint}
          onMoveRoutePointToPosition={controller.moveRoutePointToPosition}
          onFocusDepartureOnMap={controller.focusDepartureOnMap}
          onHandleDepartureMapPick={controller.handleDepartureMapPick}
          onSaveManualDeparturePoint={() => void controller.saveManualMapDeparturePoint()}
          onCancelDepartureMapSelection={controller.cancelDepartureMapSelection}
        />
      )}

      <Portal>
        <DepartureSelectionDialog
          visible={controller.departureModalVisible}
          canDismiss={controller.canDismissDepartureModal}
          requiresInitialDepartureSelection={controller.requiresInitialDepartureSelection}
          departurePoint={controller.departurePoint}
          departurePresets={controller.departurePresets}
          departureSettingsSaving={controller.departureSettingsSaving}
          onDismiss={controller.closeDepartureSelection}
          onUsePreset={(presetKey) => void controller.usePresetDeparturePoint(presetKey)}
          onUseCurrentLocation={() => void controller.useCurrentDeviceLocation()}
          onBeginMapSelection={controller.beginDepartureMapSelection}
        />
        <ToLoadingConfirmDialog
          visible={controller.toLoadingConfirmVisible}
          loading={controller.toLoadingSaving}
          hasRouteOrderChanges={controller.hasRouteOrderChanges}
          onDismiss={controller.closeToLoadingConfirm}
          onConfirm={() => void controller.submitToLoading()}
        />
      </Portal>

      <Snackbar
        visible={controller.snackbarVisible}
        onDismiss={() => controller.setSnackbarVisible(false)}
        duration={4000}
      >
        {controller.snackbarMessage || controller.error || 'Ошибка обмена с 1С'}
      </Snackbar>
    </View>
  );
}
