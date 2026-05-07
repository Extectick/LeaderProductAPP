import type { TransportTaskDeparturePoint } from '../types';
import React, { useCallback, useRef } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { Surface, Text } from 'react-native-paper';
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
  const editButtonScale = useRef(new Animated.Value(1)).current;

  const animateEditButton = useCallback(
    (value: number) => {
      Animated.timing(editButtonScale, {
        toValue: value,
        duration: 120,
        useNativeDriver: true,
      }).start();
    },
    [editButtonScale]
  );

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
          <Animated.View style={{ transform: [{ scale: editButtonScale }] }}>
            <Pressable
              onPress={onPressEdit}
              onHoverIn={() => animateEditButton(1.06)}
              onHoverOut={() => animateEditButton(1)}
              onPressIn={() => animateEditButton(0.92)}
              onPressOut={() => animateEditButton(Platform.OS === 'web' ? 1.06 : 1)}
              accessibilityRole="button"
              accessibilityLabel="Изменить точку отправления"
              style={({ pressed }) => [
                itemStyles.departurePointEditButton,
                compact && itemStyles.departurePointEditButtonCompact,
                pressed ? itemStyles.departurePointEditButtonPressed : null,
              ]}
            >
              <Text style={itemStyles.departurePointEditIcon}>✎</Text>
            </Pressable>
          </Animated.View>
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
