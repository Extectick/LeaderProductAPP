import type { TransportTaskCoordinatePoint } from '../types';
import React from 'react';
import { View } from 'react-native';
import { Button, Surface, Text } from 'react-native-paper';
import { coordinatesSummary } from '../lib/formatters';
import { styles } from './styles';

type Props = {
  draftDepartureMapPoint: TransportTaskCoordinatePoint | null;
  departureSettingsSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export default function DepartureMapSelectionPanel({
  draftDepartureMapPoint,
  departureSettingsSaving,
  onSave,
  onCancel,
}: Props) {
  return (
    <Surface style={styles.departureMapSelectionPanel} elevation={3}>
      <Text variant="titleSmall" style={styles.departureMapSelectionTitle}>
        Выбор точки отправления
      </Text>
      <Text variant="bodySmall" style={styles.mutedText}>
        Нажмите на большую карту, чтобы поставить точку 0. Она будет видна в маршруте, но не уйдет в 1С.
      </Text>
      <Surface style={styles.departureMapSummary} elevation={0}>
        <Text variant="bodySmall" style={styles.mutedText}>
          Выбранные координаты
        </Text>
        <Text variant="titleSmall" style={styles.departureMapSummaryValue}>
          {coordinatesSummary(draftDepartureMapPoint)}
        </Text>
      </Surface>
      <View style={styles.departureMapActions}>
        <Button mode="contained" onPress={onSave} loading={departureSettingsSaving} disabled={departureSettingsSaving || !draftDepartureMapPoint}>
          Сохранить точку
        </Button>
        <Button mode="outlined" onPress={onCancel} disabled={departureSettingsSaving}>
          Отменить
        </Button>
      </View>
    </Surface>
  );
}
