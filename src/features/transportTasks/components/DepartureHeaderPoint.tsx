import type { TransportTaskDeparturePoint } from '../types';
import React from 'react';
import { View } from 'react-native';
import { List, Surface, Text } from 'react-native-paper';
import AnimatedPressable from './AnimatedPressable';
import { coordinatesSummary } from '../lib/formatters';
import { itemStyles } from './itemStyles';

type Props = {
  point: TransportTaskDeparturePoint | null;
  loading?: boolean;
  saving?: boolean;
  onPress: () => void;
};

export default function DepartureHeaderPoint({ point, loading, saving, onPress }: Props) {
  return (
    <AnimatedPressable onPress={onPress} disabled={loading || saving} hoverScale={1.02} pressScale={0.985}>
      <Surface style={itemStyles.departureHeaderCard} elevation={0}>
        <View style={itemStyles.departureHeaderIcon}>
          <List.Icon icon="map-marker-radius-outline" color="#D97706" />
        </View>
        <View style={itemStyles.departureHeaderTextWrap}>
          {point ? (
            <>
              <Text numberOfLines={1} variant="bodySmall" style={itemStyles.departureHeaderPrimary}>
                {coordinatesSummary(point)}
              </Text>
              {point.address ? (
                <Text numberOfLines={2} variant="bodySmall" style={itemStyles.departureHeaderAddress}>
                  {point.address}
                </Text>
              ) : null}
            </>
          ) : loading ? (
            <Text numberOfLines={1} variant="bodySmall" style={itemStyles.pointMetaText}>
              Загружаем точку
            </Text>
          ) : (
            <Text numberOfLines={1} variant="bodySmall" style={itemStyles.departureCardEmpty}>
              Точка не выбрана
            </Text>
          )}
        </View>
      </Surface>
    </AnimatedPressable>
  );
}
