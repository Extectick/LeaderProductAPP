/** Preserve significant integer zeroes while displaying fractional weights with a comma. */
export function formatWebQuantity(value: number, weight: boolean): string {
  return (weight ? value.toFixed(3).replace(/\.?0+$/, '') : String(Math.round(value))).replace('.', ',');
}

export function stepWebQuantity(quantity: unknown, weight: boolean, direction: 1 | -1): string {
  const current = Number(String(quantity || '').replace(',', '.')) || 0;
  return formatWebQuantity(Math.max(weight ? 0.001 : 1, current + direction), weight);
}

/** Values still use the existing live draft/autosave; Escape restores the focus checkpoint. */
export function handleWebCellKey(event: {
  key: string;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
  target: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
}, restore: () => void) {
  if (event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229) return;
  if (event.key !== 'Enter' && event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') restore();
  (event.target as HTMLInputElement | null)?.blur?.();
}
