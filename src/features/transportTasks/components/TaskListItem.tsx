import type { OnecLpAppTransportTask } from '@/utils/onecLpAppService';
import React from 'react';
import { View } from 'react-native';
import { IconButton, Surface, Text } from 'react-native-paper';
import AnimatedPressable from './AnimatedPressable';
import { routeSummary, formatDateTime, statusIcon, statusTone, transportTaskStatusLabel } from '../lib/formatters';
import { itemStyles } from './itemStyles';

type Props = {
  task: OnecLpAppTransportTask;
  onPress: () => void;
};

function TaskListItem({ task, onPress }: Props) {
  const tone = statusTone(task.status);

  return (
    <AnimatedPressable onPress={onPress}>
      <Surface style={itemStyles.listItem} elevation={0}>
        <View style={itemStyles.listItemHeader}>
          <Text numberOfLines={1} variant="titleSmall" style={itemStyles.listItemTitle}>
            {task.number || task.guid}
          </Text>
          <IconButton
            icon={statusIcon(task.status)}
            size={18}
            mode="contained-tonal"
            iconColor={tone.text}
            containerColor={tone.bg}
            style={[itemStyles.statusIconButton, { borderColor: tone.border }]}
            accessibilityLabel={task.status || 'Статус не указан'}
          />
        </View>
        <Text numberOfLines={1} variant="bodySmall" style={[itemStyles.pointMetaText, { color: tone.text, fontWeight: '700' }]}>
          {transportTaskStatusLabel(task.status)}
        </Text>
        <Text numberOfLines={1} variant="bodySmall" style={itemStyles.pointMetaText}>
          Дата: {formatDateTime(task.date)}
        </Text>
        <Text numberOfLines={1} variant="bodySmall" style={itemStyles.pointMetaText}>
          План: {formatDateTime(task.plannedStart)} - {formatDateTime(task.plannedEnd)}
        </Text>
        <Text numberOfLines={1} variant="bodySmall" style={itemStyles.pointMetaText}>
          {routeSummary(task)}
        </Text>
      </Surface>
    </AnimatedPressable>
  );
}

export default React.memo(TaskListItem);
