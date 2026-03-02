import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { RoutePointDto } from '@/utils/trackingService';
import { trackingStyles as styles } from '../styles';
import TrackingModalShell from './TrackingModalShell';
import TrackingPointsList from './TrackingPointsList';

type Props = {
  visible: boolean;
  onClose: () => void;
  isMobileWeb: boolean;
  modalMapHeight: number;
  points: RoutePointDto[];
  rawPointsCount: number;
  selectedPointIndex: number | null;
  onFocusPoint: (idx: number) => void;
  formatDateTime: (value?: string | null) => string;
  mapNode: React.ReactNode;
};

export default function TrackingMapModal({
  visible,
  onClose,
  isMobileWeb,
  modalMapHeight,
  points,
  rawPointsCount,
  selectedPointIndex,
  onFocusPoint,
  formatDateTime,
  mapNode,
}: Props) {
  return (
    <TrackingModalShell
      visible={visible}
      title="Карта трека"
      onClose={onClose}
      variant="fullscreen"
      bodyStyle={{ flex: 1, minHeight: 0 }}
    >
      <View
        style={[
          styles.mapModalContent,
          isMobileWeb ? styles.mapModalMobileLayout : styles.mapModalDesktopLayout,
        ]}
      >
        <View style={styles.mapModalMapColumn}>
          <View style={[styles.mapContainer, { minHeight: modalMapHeight, height: modalMapHeight }]}>
            {mapNode}
          </View>
        </View>

        {isMobileWeb ? (
          <View style={styles.mapModalMobilePanel}>
            <Text style={styles.cardTitle}>
              Точки ({points.length}
              {rawPointsCount > points.length ? ` из ${rawPointsCount}` : ''})
            </Text>
            <TrackingPointsList
              points={points}
              selectedPointIndex={selectedPointIndex}
              onFocusPoint={onFocusPoint}
              formatDateTime={formatDateTime}
              maxHeight={260}
            />
          </View>
        ) : (
          <View style={styles.mapModalSidebar}>
            <View
              style={[
                styles.mapModalSidebarHeader,
                { position: 'sticky' as any, top: 0, zIndex: 2 },
              ]}
            >
              <Text style={styles.mapModalSidebarHeaderTitle}>
                Точки ({points.length}
                {rawPointsCount > points.length ? ` из ${rawPointsCount}` : ''})
              </Text>
              <Text style={styles.mutedText}>Выберите точку для фокуса на карте</Text>
            </View>
            <ScrollView contentContainerStyle={styles.mapModalSidebarBody}>
              <TrackingPointsList
                points={points}
                selectedPointIndex={selectedPointIndex}
                onFocusPoint={onFocusPoint}
                formatDateTime={formatDateTime}
              />
            </ScrollView>
          </View>
        )}
      </View>
    </TrackingModalShell>
  );
}
