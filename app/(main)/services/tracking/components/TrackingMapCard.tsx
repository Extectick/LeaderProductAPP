import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { trackingStyles as styles } from '../styles';

type Props = {
  hasPoints: boolean;
  onOpenMapModal: () => void;
  children: React.ReactNode;
};

export default function TrackingMapCard({ hasPoints, onOpenMapModal, children }: Props) {
  const secondaryBtnStyle = (state: any) => [
    styles.secondaryBtn,
    state?.hovered && styles.secondaryBtnHover,
    state?.pressed && styles.secondaryBtnPressed,
  ];

  return (
    <View style={styles.card}>
      <View style={styles.rowSpaceBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Карта трека</Text>
          <Text style={styles.cardSubtitle}>
            Визуализация маршрута и точек с фокусом по выбранной записи.
          </Text>
        </View>
        <Pressable onPress={onOpenMapModal} style={secondaryBtnStyle} disabled={!hasPoints}>
          <Ionicons name="expand-outline" size={16} color="#1D4ED8" />
          <Text style={styles.secondaryBtnText}>Открыть карту</Text>
        </Pressable>
      </View>

      <View style={styles.mapContainer}>
        {hasPoints ? (
          children
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mutedText}>Нет точек для отображения. Проверьте выбранный период.</Text>
          </View>
        )}
      </View>
    </View>
  );
}
