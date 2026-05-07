import type { OnecLpAppDeparturePointPresetKey } from '@/utils/onecLpAppService';
import type { TransportTaskDeparturePoint, TransportTaskDeparturePreset } from '../types';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Chip, Dialog, IconButton, Surface, Text } from 'react-native-paper';
import { formatCoordinateValue } from '../lib/formatters';
import { styles } from './styles';

type Props = {
  visible: boolean;
  canDismiss: boolean;
  requiresInitialDepartureSelection: boolean;
  departurePoint: TransportTaskDeparturePoint | null;
  departurePresets: TransportTaskDeparturePreset[];
  departureSettingsSaving: boolean;
  onDismiss: () => void;
  onUsePreset: (presetKey: OnecLpAppDeparturePointPresetKey) => void;
  onUseCurrentLocation: () => void;
  onBeginMapSelection: () => void;
};

export default function DepartureSelectionDialog({
  visible,
  canDismiss,
  requiresInitialDepartureSelection,
  departurePoint,
  departurePresets,
  departureSettingsSaving,
  onDismiss,
  onUsePreset,
  onUseCurrentLocation,
  onBeginMapSelection,
}: Props) {
  return (
    <Dialog
      visible={visible}
      onDismiss={onDismiss}
      dismissable={canDismiss && !departureSettingsSaving}
      style={styles.departureDialog}
    >
      <Dialog.Content style={styles.departureDialogContent}>
        <View style={styles.departureModalHeader}>
          <View style={styles.departureModalTitleWrap}>
            <Text variant="titleLarge" style={styles.departureModalTitle}>
              {requiresInitialDepartureSelection && !departurePoint
                ? 'Выберите точку отправления'
                : 'Настройка точки отправления'}
            </Text>
            <Text variant="bodySmall" style={styles.mutedText}>
              Точка 0 будет видна в маршруте, но не уйдет в порядок точек 1С.
            </Text>
          </View>
          {canDismiss && !departureSettingsSaving ? <IconButton icon="close" onPress={onDismiss} /> : null}
        </View>

        <ScrollView contentContainerStyle={styles.departureModalScroll}>
          <Text variant="titleSmall" style={styles.departureSectionTitle}>
            Пресеты
          </Text>
          {departurePresets.map((preset) => {
            const selected =
              departurePoint?.source === 'PRESET' && departurePoint?.presetKey === preset.key;

            return (
              <Pressable key={preset.key} onPress={() => onUsePreset(preset.key)}>
                <Surface
                  style={[styles.departureOptionCard, selected && styles.departureOptionCardSelected]}
                  elevation={0}
                >
                  <View style={styles.departureOptionHeader}>
                    <Text variant="titleSmall" style={styles.departureOptionTitle}>
                      {preset.label}
                    </Text>
                    <Chip compact style={styles.departureOptionChip}>
                      {formatCoordinateValue(preset.latitude)}, {formatCoordinateValue(preset.longitude)}
                    </Chip>
                  </View>
                  <Text variant="bodySmall" style={styles.mutedText}>
                    {preset.address}
                  </Text>
                </Surface>
              </Pressable>
            );
          })}

          <View style={styles.departureActionsRow}>
            <Button
              mode="outlined"
              icon="crosshairs-gps"
              onPress={onUseCurrentLocation}
              loading={departureSettingsSaving}
              disabled={departureSettingsSaving}
            >
              Использовать мою геолокацию
            </Button>
            <Button
              mode="contained"
              icon="map-marker-plus"
              onPress={onBeginMapSelection}
              disabled={departureSettingsSaving}
            >
              Выбрать на карте
            </Button>
          </View>

          <Text variant="bodySmall" style={styles.mutedText}>
            После нажатия модальное окно закроется, и выбор точки откроется на большой карте.
          </Text>
        </ScrollView>
      </Dialog.Content>
    </Dialog>
  );
}
