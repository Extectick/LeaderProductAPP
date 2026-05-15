import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import type TransportTasksToolbar from '../screen/TransportTasksToolbar';
import TransportTaskStatusFilterMenu from '../screen/TransportTaskStatusFilterMenu';
import { mobileSheetStyles as styles } from './styles';

type Props = React.ComponentProps<typeof TransportTasksToolbar>;

type MobileActionButtonProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tone?: 'neutral' | 'primary' | 'success' | 'warning';
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

function MobileActionButton({
  icon,
  tone = 'neutral',
  disabled,
  loading,
  onPress,
  accessibilityLabel,
}: MobileActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.mobileActionButton,
        tone === 'primary' && styles.mobileActionButtonPrimary,
        tone === 'success' && styles.mobileActionButtonSuccess,
        tone === 'warning' && styles.mobileActionButtonWarning,
        (disabled || loading) && styles.mobileActionButtonDisabled,
        pressed && !(disabled || loading) ? styles.mobileActionButtonPressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size={16}
          color={tone === 'neutral' ? '#475569' : '#FFFFFF'}
        />
      ) : (
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={tone === 'neutral' ? '#334155' : '#FFFFFF'}
        />
      )}
    </Pressable>
  );
}

function TransportTasksMobileSheetToolbar({
  selectedTask,
  routeCount,
  hasRouteOrderChanges,
  routeOrderEditable,
  routeOrderSaving,
  toLoadingSaving,
  canSubmitToLoading,
  tasksLoading,
  taskStatusFilter,
  onBack,
  onSaveRouteOrder,
  onOpenToLoadingConfirm,
  onOptimizeRouteOrder,
  onRefreshTasks,
  onTaskStatusFilterChange,
}: Props) {
  if (selectedTask) {
    return (
      <View style={styles.mobileToolbarRow}>
        <View style={styles.mobileToolbarLeft}>
          <MobileActionButton
            icon="arrow-left"
            onPress={onBack}
            accessibilityLabel="Назад"
          />
        </View>
        <View style={styles.mobileToolbarActions}>
          {routeOrderEditable && routeCount > 0 && hasRouteOrderChanges ? (
            <MobileActionButton
              icon="content-save-outline"
              tone="success"
              disabled={toLoadingSaving}
              loading={routeOrderSaving}
              onPress={onSaveRouteOrder}
              accessibilityLabel="Сохранить"
            />
          ) : null}
          {canSubmitToLoading ? (
            <MobileActionButton
              icon="truck-fast-outline"
              tone="warning"
              disabled={routeOrderSaving}
              loading={toLoadingSaving}
              onPress={onOpenToLoadingConfirm}
              accessibilityLabel="К погрузке"
            />
          ) : null}
          {routeOrderEditable && routeCount > 0 ? (
            <MobileActionButton
              icon="map-marker-distance"
              disabled={routeOrderSaving || toLoadingSaving || routeCount < 2}
              onPress={onOptimizeRouteOrder}
              accessibilityLabel="Автопорядок"
            />
          ) : null}
          <MobileActionButton
            icon="refresh"
            loading={tasksLoading}
            disabled={routeOrderSaving || toLoadingSaving}
            onPress={onRefreshTasks}
            accessibilityLabel="Обновить"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.mobileToolbarRow}>
      <View style={styles.mobileToolbarFilterWrap}>
        <TransportTaskStatusFilterMenu
          value={taskStatusFilter}
          compact
          disabled={tasksLoading}
          onChange={onTaskStatusFilterChange}
        />
      </View>
      <View style={styles.mobileToolbarActions}>
        <MobileActionButton
          icon="refresh"
          loading={tasksLoading}
          onPress={onRefreshTasks}
          accessibilityLabel="Обновить"
        />
      </View>
    </View>
  );
}

export default React.memo(TransportTasksMobileSheetToolbar);
