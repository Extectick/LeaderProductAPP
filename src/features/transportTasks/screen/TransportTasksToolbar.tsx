import type { OnecLpAppTransportTask } from '@/utils/onecLpAppService';
import type { TransportTaskDeparturePoint } from '../types';
import React from 'react';
import { View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import WebHoverTitle from '../components/WebHoverTitle';
import { styles } from './styles';
import TransportTaskStatusFilterMenu from './TransportTaskStatusFilterMenu';

type Props = {
  selectedTask: OnecLpAppTransportTask | null;
  routeCount: number;
  hasRouteOrderChanges: boolean;
  routeOrderEditable: boolean;
  routeOrderSaving: boolean;
  toLoadingSaving: boolean;
  canSubmitToLoading: boolean;
  tasksLoading: boolean;
  departurePoint: TransportTaskDeparturePoint | null;
  taskStatusFilter: string | null;
  compact?: boolean;
  onBack: () => void;
  onSaveRouteOrder: () => void;
  onOpenToLoadingConfirm: () => void;
  onOptimizeRouteOrder: () => void;
  onRefreshTasks: () => void;
  onTaskStatusFilterChange: (status: string | null) => void;
};

export default function TransportTasksToolbar({
  selectedTask,
  routeCount,
  hasRouteOrderChanges,
  routeOrderEditable,
  routeOrderSaving,
  toLoadingSaving,
  canSubmitToLoading,
  tasksLoading,
  departurePoint,
  taskStatusFilter,
  compact = false,
  onBack,
  onSaveRouteOrder,
  onOpenToLoadingConfirm,
  onOptimizeRouteOrder,
  onRefreshTasks,
  onTaskStatusFilterChange,
}: Props) {
  const iconSize = compact ? 16 : 18;
  const iconButtonStyle = compact ? styles.panelTopBarCompactButton : undefined;

  return (
    <View style={[styles.panelTopBar, compact && styles.panelTopBarCompact]}>
      {selectedTask ? (
        <WebHoverTitle title="Назад">
          <IconButton
            icon="arrow-left"
            size={iconSize}
            mode="outlined"
            onPress={onBack}
            style={iconButtonStyle}
            accessibilityLabel="Назад"
          />
        </WebHoverTitle>
      ) : null}

      <View style={styles.panelDepartureWrap}>
        {selectedTask && !compact ? (
          <View style={styles.panelTaskTitleWrap}>
            <Text numberOfLines={1} variant="titleSmall" style={styles.panelTaskTitle}>
              {selectedTask.number || selectedTask.guid}
            </Text>
            <Text numberOfLines={1} variant="bodySmall" style={styles.panelTaskMeta}>
              На карте: {routeCount + (departurePoint ? 1 : 0)} точек
            </Text>
          </View>
        ) : !selectedTask ? (
          <View style={[styles.panelTaskTitleWrap, compact && styles.panelListTitleWrapCompact]}>
            {!compact ? (
              <Text numberOfLines={1} variant="titleSmall" style={styles.panelTaskTitle}>
                Задания на перевозку
              </Text>
            ) : null}
            <TransportTaskStatusFilterMenu
              value={taskStatusFilter}
              compact={compact}
              disabled={tasksLoading}
              onChange={onTaskStatusFilterChange}
            />
          </View>
        ) : null}
      </View>

      {selectedTask && routeOrderEditable && routeCount > 0 && hasRouteOrderChanges ? (
        <WebHoverTitle title="Сохранить">
          <IconButton
            icon="content-save-outline"
            size={iconSize}
            mode="contained"
            onPress={onSaveRouteOrder}
            disabled={routeOrderSaving || toLoadingSaving}
            loading={routeOrderSaving}
            containerColor="#16A34A"
            iconColor="#FFFFFF"
            style={iconButtonStyle}
            accessibilityLabel="Сохранить"
          />
        </WebHoverTitle>
      ) : null}

      {selectedTask && canSubmitToLoading ? (
        <WebHoverTitle title="К погрузке">
          <IconButton
            icon="truck-fast-outline"
            size={iconSize}
            mode="contained"
            onPress={onOpenToLoadingConfirm}
            disabled={routeOrderSaving || toLoadingSaving}
            loading={toLoadingSaving}
            containerColor="#F97316"
            iconColor="#FFFFFF"
            style={[iconButtonStyle, styles.toLoadingToolbarButton]}
            accessibilityLabel="К погрузке"
          />
        </WebHoverTitle>
      ) : null}

      {selectedTask && routeOrderEditable && routeCount > 0 ? (
        <WebHoverTitle title="Автопорядок">
          <IconButton
            icon="map-marker-distance"
            size={iconSize}
            mode="outlined"
            onPress={onOptimizeRouteOrder}
            disabled={routeOrderSaving || toLoadingSaving || routeCount < 2}
            style={iconButtonStyle}
            accessibilityLabel="Автопорядок"
          />
        </WebHoverTitle>
      ) : null}

      <WebHoverTitle title="Обновить">
        <IconButton
          icon="refresh"
          size={iconSize}
          mode="outlined"
          onPress={onRefreshTasks}
          disabled={tasksLoading}
          loading={tasksLoading}
          style={iconButtonStyle}
          accessibilityLabel="Обновить"
        />
      </WebHoverTitle>
    </View>
  );
}
