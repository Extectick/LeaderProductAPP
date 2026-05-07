import React from 'react';
import { Button, Menu } from 'react-native-paper';
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
        <Button
          mode="outlined"
          compact
          icon={selected.icon}
          disabled={disabled}
          onPress={() => setVisible(true)}
          style={[styles.statusFilterButton, compact && styles.statusFilterButtonCompact]}
          labelStyle={[styles.statusFilterButtonLabel, compact && styles.statusFilterButtonLabelCompact]}
        >
          {compact ? selected.compactLabel : selected.label}
        </Button>
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
