import type { OnecLpAppRoutePoint } from '@/utils/onecLpAppService';
import type { RouteDragHandleProps } from '../RoutePointSortableList';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, TextInput, View } from 'react-native';
import { IconButton, Surface, Text } from 'react-native-paper';
import { formatDateTime, routePointAddress } from '../lib/formatters';
import AnimatedPressable from './AnimatedPressable';
import { itemStyles } from './itemStyles';

type Props = {
  point: OnecLpAppRoutePoint;
  index: number;
  total: number;
  selected?: boolean;
  editing?: boolean;
  saving?: boolean;
  compact?: boolean;
  showDragHandle?: boolean;
  dragHandleProps?: RouteDragHandleProps;
  onPress: () => void;
  onMoveTo?: (fromIndex: number, position: number) => void;
};

export default function RoutePointListItem({
  point,
  index,
  total,
  selected,
  editing,
  saving,
  compact = false,
  showDragHandle = Boolean(editing && Platform.OS === 'web'),
  dragHandleProps,
  onPress,
  onMoveTo,
}: Props) {
  const [positionEditing, setPositionEditing] = useState(false);
  const [positionText, setPositionText] = useState(String(index + 1));
  const [numberHovered, setNumberHovered] = useState(false);
  const [dragHandleHovered, setDragHandleHovered] = useState(false);
  const [dragHandlePressed, setDragHandlePressed] = useState(false);
  const dragHandleScale = useRef(new Animated.Value(1)).current;
  const fullAddress = routePointAddress(point);

  useEffect(() => {
    setPositionText(String(index + 1));
    setPositionEditing(false);
  }, [index, point.linkKey]);

  const animateDragHandle = useCallback(
    (value: number) => {
      Animated.timing(dragHandleScale, {
        toValue: value,
        duration: 140,
        useNativeDriver: true,
      }).start();
    },
    [dragHandleScale]
  );

  const applyManualPosition = (value: string) => {
    const position = Number.parseInt(value, 10);
    setPositionEditing(false);
    setPositionText(String(index + 1));
    if (!Number.isFinite(position)) return;
    onMoveTo?.(index, Math.max(1, Math.min(total, position)));
  };

  const dragHandleWebProps =
    editing && Platform.OS === 'web'
      ? ({
          ref: dragHandleProps?.setActivatorNodeRef,
          ...(dragHandleProps?.attributes ?? {}),
          ...(dragHandleProps?.listeners ?? {}),
        } as any)
      : {};

  return (
    <AnimatedPressable onPress={onPress} hoverScale={1.008} pressScale={0.993} webTitle={fullAddress}>
      <Surface
        style={[
          itemStyles.listItem,
          compact && itemStyles.listItemCompact,
          selected && itemStyles.listItemSelected,
        ]}
        elevation={0}
      >
        <View style={[itemStyles.pointHeader, compact && itemStyles.pointHeaderCompact]}>
          <Pressable
            disabled={!editing || saving}
            onHoverIn={() => setNumberHovered(true)}
            onHoverOut={() => setNumberHovered(false)}
            onPress={() => {
              if (!editing || saving) return;
              setPositionText(String(index + 1));
              setPositionEditing(true);
            }}
            style={[
              itemStyles.pointNumber,
              compact && itemStyles.pointNumberCompact,
              selected && itemStyles.pointNumberSelected,
              editing && itemStyles.pointNumberEditable,
              editing && numberHovered && itemStyles.pointNumberHover,
              positionEditing && itemStyles.pointNumberEditing,
            ]}
          >
            {positionEditing ? (
              <TextInput
                value={positionText}
                keyboardType="numeric"
                selectTextOnFocus
                autoFocus
                editable={!saving}
                onChangeText={setPositionText}
                onBlur={() => applyManualPosition(positionText)}
                onSubmitEditing={() => applyManualPosition(positionText)}
                onKeyPress={(event) => {
                  if (event.nativeEvent.key === 'Enter') applyManualPosition(positionText);
                }}
                style={[
                  itemStyles.pointNumberInput,
                  compact && itemStyles.pointNumberInputCompact,
                  selected && itemStyles.pointNumberInputSelected,
                  positionEditing && itemStyles.pointNumberInputEditing,
                ]}
              />
            ) : (
              <Text
                style={[
                  itemStyles.pointNumberText,
                  compact && itemStyles.pointNumberTextCompact,
                  selected && itemStyles.pointNumberTextSelected,
                  positionEditing && itemStyles.pointNumberTextEditing,
                ]}
              >
                {index + 1}
              </Text>
            )}
          </Pressable>
          <View style={itemStyles.pointTextWrap}>
            <Text
              numberOfLines={2}
              variant="bodyMedium"
              style={[itemStyles.pointAddressText, compact && itemStyles.pointAddressTextCompact]}
              {...(Platform.OS === 'web' ? ({ title: fullAddress } as any) : {})}
            >
              {fullAddress}
            </Text>
            <Text
              numberOfLines={1}
              variant="bodySmall"
              style={[itemStyles.pointRouteText, compact && itemStyles.pointRouteTextCompact]}
            >
              {point.zone || 'Зона не указана'}
            </Text>
          </View>
          {showDragHandle ? (
            <Animated.View style={[itemStyles.routeDragHandleWrap, { transform: [{ scale: dragHandleScale }] }]}>
              <Pressable
                {...dragHandleWebProps}
                disabled={saving}
                onHoverIn={() => {
                  setDragHandleHovered(true);
                  animateDragHandle(1.08);
                }}
                onHoverOut={() => {
                  setDragHandleHovered(false);
                  setDragHandlePressed(false);
                  animateDragHandle(1);
                }}
                onPressIn={() => {
                  setDragHandlePressed(true);
                  animateDragHandle(0.94);
                }}
                onPressOut={() => {
                  setDragHandlePressed(false);
                  animateDragHandle(dragHandleHovered ? 1.08 : 1);
                }}
                style={[
                  itemStyles.routeDragHandle,
                  dragHandleHovered && itemStyles.routeDragHandleHovered,
                  dragHandlePressed && itemStyles.routeDragHandlePressed,
                  saving && itemStyles.routeDragHandleDisabled,
                ]}
                accessibilityLabel="Перетащить точку маршрута"
              >
                <IconButton
                  icon="drag"
                  size={22}
                  disabled={saving}
                  iconColor={dragHandleHovered || dragHandlePressed ? '#1D4ED8' : '#64748B'}
                  style={itemStyles.routeDragIcon}
                />
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
        <View style={[itemStyles.pointMetaRow, compact && itemStyles.pointMetaRowCompact]}>
          <Text
            numberOfLines={1}
            variant="bodySmall"
            style={[itemStyles.pointMetaText, compact && itemStyles.pointMetaTextCompact]}
          >
            Доставка: {formatDateTime(point.deliveryTimeFrom)} - {formatDateTime(point.deliveryTimeTo)}
          </Text>
          <Text
            numberOfLines={1}
            variant="bodySmall"
            style={[itemStyles.pointMetaText, compact && itemStyles.pointMetaTextCompact]}
          >
            Распоряжений: {point.orders?.length ?? 0}
          </Text>
        </View>
      </Surface>
    </AnimatedPressable>
  );
}
