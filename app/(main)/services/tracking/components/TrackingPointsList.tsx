import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { RoutePointDto } from '@/utils/trackingService';
import { trackingStyles as styles } from '@/src/features/tracking/styles';
import { getRoutePointDateTimeLabels } from '@/src/features/tracking/helpers';

type Props = {
  points: RoutePointDto[];
  selectedPointIndex: number | null;
  onFocusPoint: (idx: number) => void;
  formatDateTime?: (value?: string | null) => string;
  maxHeight?: number;
};

export default function TrackingPointsList({
  points,
  selectedPointIndex,
  onFocusPoint,
  maxHeight,
}: Props) {
  const content = (
    <View style={styles.pointList}>
      {points.map((p, idx) => {
        const isActive = selectedPointIndex === idx;
        const labels = getRoutePointDateTimeLabels(p);
        return (
          <Pressable
            key={`track-pt-${p.id}-${idx}`}
            onPress={() => onFocusPoint(idx)}
            style={(state: any) => [
              styles.pointItem,
              isActive && styles.pointItemActive,
              state?.hovered && !isActive && { borderColor: '#BFDBFE', backgroundColor: '#F8FAFF' },
              state?.pressed && { opacity: 0.95 },
            ]}
          >
            <View style={styles.pointMetaRow}>
              <Text style={styles.pointTime}>{labels.primary}</Text>
              <Text style={styles.pointTag}>{p.eventType === 'STOP' ? 'стоп' : 'движение'}</Text>
            </View>
            {labels.secondary ? <Text style={styles.pointTag}>{labels.secondary}</Text> : null}
            <Text style={styles.pointCoords}>
              {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
            </Text>
            {p.accuracy != null ? <Text style={styles.pointTag}>Точность: +{p.accuracy} м</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );

  if (typeof maxHeight === 'number' && maxHeight > 0) {
    return (
      <ScrollView style={{ maxHeight }} contentContainerStyle={{ paddingBottom: 4 }}>
        {content}
      </ScrollView>
    );
  }

  return content;
}
