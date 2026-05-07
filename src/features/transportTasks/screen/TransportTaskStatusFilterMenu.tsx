import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Menu } from 'react-native-paper';
import {
  TRANSPORT_TASK_STATUS_FORMING,
  TRANSPORT_TASK_STATUS_ROUTE_ORDERING,
  TRANSPORT_TASK_STATUS_TO_LOADING,
} from '../lib/formatters';
import { styles } from './styles';

type Props = {
  value: string | null;
  compact?: boolean;
  disabled?: boolean;
  onChange: (status: string | null) => void;
};

const STATUS_FILTER_OPTIONS = [
  { value: null, label: 'Все статусы', compactLabel: 'Все', icon: 'filter-variant' },
  { value: TRANSPORT_TASK_STATUS_FORMING, label: 'Формируется', compactLabel: 'Формируется', icon: 'progress-clock' },
  {
    value: TRANSPORT_TASK_STATUS_ROUTE_ORDERING,
    label: 'Маршрут сформирован',
    compactLabel: 'Сформирован',
    icon: 'playlist-edit',
  },
  { value: TRANSPORT_TASK_STATUS_TO_LOADING, label: 'К погрузке', compactLabel: 'К погрузке', icon: 'truck-outline' },
] as const;

export default function TransportTaskStatusFilterMenu({ value, compact, disabled, onChange }: Props) {
  const [visible, setVisible] = React.useState(false);
  const selected = STATUS_FILTER_OPTIONS.find((item) => item.value === value) ?? STATUS_FILTER_OPTIONS[0];

  const close = () => setVisible(false);

  return (
    <Menu
      visible={visible}
      onDismiss={close}
      contentStyle={styles.statusFilterMenu}
      anchor={
        <Pressable
          disabled={disabled}
          onPress={() => setVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Фильтр по статусу"
          style={({ pressed }) => [
            styles.statusFilterButton,
            compact && styles.statusFilterButtonCompact,
            disabled && styles.statusFilterButtonDisabled,
            pressed && !disabled ? styles.statusFilterButtonPressed : null,
          ]}
        >
          <View style={styles.statusFilterButtonInner}>
            <View style={[styles.statusFilterIconWrap, compact && styles.statusFilterIconWrapCompact]}>
              <MaterialCommunityIcons
                name={selected.icon as any}
                size={compact ? 14 : 16}
                color="#475569"
              />
            </View>
            <Text
              numberOfLines={1}
              style={[styles.statusFilterButtonLabel, compact && styles.statusFilterButtonLabelCompact]}
            >
              {compact ? selected.compactLabel : selected.label}
            </Text>
            <MaterialCommunityIcons
              name={visible ? 'chevron-up' : 'chevron-down'}
              size={compact ? 16 : 18}
              color="#64748B"
            />
          </View>
        </Pressable>
      }
    >
      {STATUS_FILTER_OPTIONS.map((item) => (
        <Menu.Item
          key={item.value ?? 'all'}
          leadingIcon={item.icon}
          title={item.label}
          onPress={() => {
            close();
            onChange(item.value);
          }}
          titleStyle={item.value === value ? styles.statusFilterMenuItemSelected : undefined}
        />
      ))}
    </Menu>
  );
}
