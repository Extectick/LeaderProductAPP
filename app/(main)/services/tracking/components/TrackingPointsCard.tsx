import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { RoutePointDto } from '@/utils/trackingService';
import { trackingStyles as styles } from '../styles';
import TrackingPointsList from './TrackingPointsList';

type Props = {
  points: RoutePointDto[];
  rawPointsCount: number;
  loading: boolean;
  selectedPointIndex: number | null;
  onFocusPoint: (idx: number) => void;
  formatDateTime: (value?: string | null) => string;
};

export default function TrackingPointsCard({
  points,
  rawPointsCount,
  loading,
  selectedPointIndex,
  onFocusPoint,
  formatDateTime,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        Точки трека ({points.length}
        {rawPointsCount > points.length ? ` из ${rawPointsCount}` : ''})
      </Text>
      <Text style={styles.cardSubtitle}>
        Клик по точке фокусирует карту. Выбранная точка выделяется в списке и на карте.
      </Text>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#2563EB" />
          <Text style={styles.mutedText}>Загрузка точек...</Text>
        </View>
      ) : points.length === 0 ? (
        <Text style={styles.mutedText}>Нет точек за выбранный период.</Text>
      ) : (
        <>
          <TrackingPointsList
            points={points}
            selectedPointIndex={selectedPointIndex}
            onFocusPoint={onFocusPoint}
            formatDateTime={formatDateTime}
          />
          {rawPointsCount > points.length ? (
            <Text style={styles.mutedText}>
              Показаны первые {points.length} точек из {rawPointsCount} после фильтра дублей и
              ограничений.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
