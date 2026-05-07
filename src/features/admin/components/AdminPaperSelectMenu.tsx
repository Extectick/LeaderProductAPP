import React from 'react';
import { Button, Menu } from 'react-native-paper';

type Option<T extends string | number | null> = {
  value: T;
  label: string;
  icon?: string;
};

type Props<T extends string | number | null> = {
  value: T;
  options: Array<Option<T>>;
  compact?: boolean;
  disabled?: boolean;
  onChange: (value: T) => void;
};

export default function AdminPaperSelectMenu<T extends string | number | null>({
  value,
  options,
  compact,
  disabled,
  onChange,
}: Props<T>) {
  const [visible, setVisible] = React.useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <Button
          mode="outlined"
          compact={compact}
          icon={selected?.icon || 'menu-down'}
          disabled={disabled}
          onPress={() => setVisible(true)}
        >
          {selected?.label || 'Выбрать'}
        </Button>
      }
    >
      {options.map((option) => (
        <Menu.Item
          key={String(option.value ?? 'null')}
          leadingIcon={option.icon}
          title={option.label}
          onPress={() => {
            setVisible(false);
            onChange(option.value);
          }}
        />
      ))}
    </Menu>
  );
}
