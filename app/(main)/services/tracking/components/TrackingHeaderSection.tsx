import React from 'react';
import { Text, View } from 'react-native';
import { trackingStyles as styles } from '../styles';

type Props = {
  userLabel: string;
  periodLabel: string;
  routesCount: number;
  pointsCount: number;
  displayedPointsCount: number;
};

export default function TrackingHeaderSection({
  userLabel,
  periodLabel,
  routesCount,
  pointsCount,
  displayedPointsCount,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Трекинг</Text>
      <Text style={styles.subtitle}>
        История перемещений сотрудника за период. Выберите пользователя, настройте фильтры и
        работайте с картой и точками маршрута.
      </Text>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Пользователь</Text>
          <Text style={styles.summaryValue} numberOfLines={1}>
            {userLabel}
          </Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Период</Text>
          <Text style={styles.summaryValue} numberOfLines={1}>
            {periodLabel}
          </Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Маршрутов</Text>
          <Text style={styles.summaryValue}>{routesCount}</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Точек найдено</Text>
          <Text style={styles.summaryValue}>{pointsCount}</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Точек показано</Text>
          <Text style={styles.summaryValue}>{displayedPointsCount}</Text>
        </View>
      </View>
    </View>
  );
}
