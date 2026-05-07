import type { TransportTaskDeparturePoint } from '../types';
import React from 'react';
import { Platform, View } from 'react-native';
import { IconButton, Surface, Text } from 'react-native-paper';
import { coordinatesSummary, departurePrimaryText, departureSourceLabel } from '../lib/formatters';
import AnimatedPressable from './AnimatedPressable';
import { itemStyles } from './itemStyles';

type Props = {
  point: TransportTaskDeparturePoint;
  selected?: boolean;
  compact?: boolean;
  onPress: () => void;
  onPressEdit: () => void;
};

export default function DepartureRoutePointListItem({
  point,
  selected,
  compact = false,
  onPress,
  onPressEdit,
}: Props) {
  const primaryText = departurePrimaryText(point);
  const sourceLabel = departureSourceLabel(point);

  return (
    <AnimatedPressable onPress={onPress} hoverScale={1.01} pressScale={0.992} webTitle={primaryText}>
      <Surface
        style={[
          itemStyles.listItem,
          compact && itemStyles.listItemCompact,
          itemStyles.departureListItem,
          compact && itemStyles.departureListItemCompact,
          selected && itemStyles.departureListItemSelected,
        ]}
        elevation={0}
      >
        <View style={[itemStyles.pointHeader, compact && itemStyles.pointHeaderCompact]}>
          <View
            style={[
              itemStyles.pointNumber,
              compact && itemStyles.pointNumberCompact,
              itemStyles.departurePointNumber,
              selected && itemStyles.pointNumberSelected,
            ]}
          >
            <Text
              style={[
                itemStyles.pointNumberText,
                compact && itemStyles.pointNumberTextCompact,
                itemStyles.departurePointNumberText,
              ]}
            >
              0
            </Text>
          </View>
          <View style={itemStyles.pointTextWrap}>
            <Text
              numberOfLines={2}
              variant="bodyMedium"
              style={[itemStyles.pointAddressText, compact && itemStyles.pointAddressTextCompact]}
              {...(Platform.OS === 'web' ? ({ title: primaryText } as any) : {})}
            >
              {primaryText}
            </Text>
            <Text
              numberOfLines={1}
              variant="bodySmall"
              style={[itemStyles.pointMetaText, compact && itemStyles.pointMetaTextCompact]}
            >
              Точка отправления
            </Text>
          </View>
          <IconButton
            icon="pencil-outline"
            size={18}
            mode="contained-tonal"
            onPress={onPressEdit}
            style={[
              itemStyles.departurePointEditButton,
              compact && itemStyles.departurePointEditButtonCompact,
            ]}
            accessibilityLabel="Изменить точку отправления"
          />
        </View>
        {sourceLabel ? (
          <Text
            numberOfLines={1}
            variant="bodySmall"
            style={[itemStyles.pointMetaText, compact && itemStyles.pointMetaTextCompact]}
          >
            {sourceLabel}
          </Text>
        ) : null}
        <Text
          numberOfLines={1}
          variant="bodySmall"
          style={[itemStyles.pointMetaText, compact && itemStyles.pointMetaTextCompact]}
        >
          Координаты: {coordinatesSummary(point)}
        </Text>
      </Surface>
    </AnimatedPressable>
  );
}
