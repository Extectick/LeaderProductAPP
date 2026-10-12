import React from 'react';
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';
import { parsePickerQuantity } from '../../lib/productPickerQuantity';

export function ProductPickerQuantityDialog({ name, quantity, unit, fractional, disabled, onDismiss, onConfirm }: {
  name: string; quantity: number; unit: string; fractional: boolean; disabled?: boolean;
  onDismiss: () => void; onConfirm: (quantity: number) => void;
}) {
  const [input, setInput] = React.useState(() => String(quantity).replace('.', ','));
  const value = parsePickerQuantity(input, fractional);
  const submit = () => { if (!disabled && value !== null) onConfirm(value); };
  return <Portal><Dialog visible onDismiss={onDismiss} style={{ backgroundColor: '#FFFFFF' }}>
    <Dialog.Title>Количество, {unit}</Dialog.Title>
    <Dialog.Content>
      <Text numberOfLines={3} style={{ marginBottom: 12 }}>{name}</Text>
      <TextInput mode="outlined" label="Количество" value={input} onChangeText={setInput}
        keyboardType={fractional ? 'decimal-pad' : 'number-pad'} autoFocus selectTextOnFocus
        disabled={disabled} error={value === null} onSubmitEditing={submit} returnKeyType="done"
        accessibilityLabel="Количество товара" testID="picker-quantity-input" />
      <HelperText type={value === null ? 'error' : 'info'}>
        {value === null ? fractional ? 'Введите число от 0, не более 3 знаков после запятой.' : 'Введите целое число от 0.' : '0 — убрать товар из заказа'}
      </HelperText>
    </Dialog.Content>
    <Dialog.Actions>
      <Button onPress={onDismiss}>Отмена</Button>
      <Button onPress={submit} disabled={disabled || value === null}>Применить</Button>
    </Dialog.Actions>
  </Dialog></Portal>;
}
