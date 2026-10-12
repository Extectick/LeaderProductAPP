import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import type { ClientOrderProduct } from '@/utils/clientOrdersService';
import { parsePickerQuantity, type ProductQuantityChange } from '../../lib/productPickerQuantity';

function previewQuantity(current: number, change: ProductQuantityChange) {
  return Math.round(Math.max(0, 'delta' in change ? current + change.delta : change.quantity) * 1000) / 1000;
}

/** Only this small control renders urgently; the document update stays in React's transition. */
export const ProductPickerQuantityControl = React.memo(function ProductPickerQuantityControl({
  item, quantity, unit, fractional, disabled = false, onChangeQuantity,
}: {
  item: ClientOrderProduct; quantity: number; unit: string; fractional: boolean; disabled?: boolean;
  onChangeQuantity: (item: ClientOrderProduct, change: ProductQuantityChange) => void;
}) {
  const [displayQuantity, updatePreview] = React.useOptimistic(quantity, previewQuantity);
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState('');
  const inputRef = React.useRef<TextInput>(null);
  const editingRef = React.useRef(false);
  const textRef = React.useRef('');
  const formatted = String(displayQuantity).replace('.', ',');
  const inputLength = Math.max(1, (editing ? text : formatted).length);

  const change = (next: ProductQuantityChange) => {
    if (disabled) return;
    React.startTransition(() => {
      updatePreview(next);
      // Enqueue the real functional draft update immediately: no timer or temporary write queue.
      onChangeQuantity(item, next);
    });
  };
  const finishEditing = () => {
    if (!editingRef.current) return;
    editingRef.current = false;
    // Clearing the field means remove on leaving the field, not midway through typing.
    if (!textRef.current.trim()) change({ quantity: 0 });
    setEditing(false);
  };
  const step = (delta: 1 | -1) => {
    if (disabled) return;
    const entered = editingRef.current && !textRef.current.trim() ? 0 : null;
    // Invalidate blur's draft before the native blur event can replay an old input value.
    editingRef.current = false;
    setEditing(false);
    inputRef.current?.blur();
    change(entered === null ? { delta } : { quantity: Math.max(0, entered + delta) });
  };

  return <View style={styles.counter} testID={`product-counter-${item.guid}`}>
    {displayQuantity > 0 ? <IconButton icon="minus" size={17} iconColor="#2563EB" style={styles.step} disabled={disabled}
      accessibilityLabel={`Уменьшить количество ${item.name}`} onPress={() => step(-1)} testID={`product-minus-${item.guid}`} /> : <View style={styles.step} />}
    {displayQuantity > 0 || editing ? <View style={styles.valueSlot}>
      <TextInput ref={inputRef} value={editing ? text : formatted} editable={!disabled}
        style={[styles.quantityInput, { width: Math.min(36, Math.max(20, inputLength * 10)), fontSize: Math.max(11, Math.min(18, 72 / inputLength)) }]}
        keyboardType={fractional ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus returnKeyType="done" maxLength={13} underlineColorAndroid="transparent"
        accessibilityLabel={`Количество ${item.name}, ${unit}`} accessibilityHint="Введите количество товара"
        testID={`product-quantity-${item.guid}`}
        onFocus={() => {
          editingRef.current = true;
          textRef.current = formatted;
          setText(formatted);
          setEditing(true);
        }}
        onChangeText={value => {
          if (disabled) return;
          // Keep the input urgent and untouched by background document renders.
          textRef.current = value;
          setText(value);
          const parsed = parsePickerQuantity(value, fractional);
          if (parsed !== null) change({ quantity: parsed });
        }}
        onBlur={finishEditing}
        onSubmitEditing={() => { finishEditing(); inputRef.current?.blur(); }} />
      <Text style={styles.unit} numberOfLines={1}>{unit}</Text>
    </View> : <View style={styles.valueSlot} />}
    <IconButton icon="plus" size={17} iconColor="#2563EB" style={styles.step} disabled={disabled}
      accessibilityLabel={`Добавить единицу ${item.name}`} onPress={() => step(1)} testID={`product-plus-${item.guid}`} />
  </View>;
});

const styles = StyleSheet.create({
  counter: { minWidth: 104, minHeight: 36, flexDirection: 'row', flexShrink: 0, alignItems: 'center', justifyContent: 'flex-end' },
  valueSlot: { minWidth: 40, minHeight: 36, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 },
  quantityInput: { flexShrink: 1, minWidth: 0, height: 32, padding: 0, lineHeight: 24, fontWeight: '700', color: '#2563EB', textAlign: 'center', includeFontPadding: false },
  unit: { maxWidth: 22, fontSize: 10, color: '#64748B' },
  step: { width: 32, height: 36, margin: 0 },
});
