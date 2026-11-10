export type PublicWeightItem = { weightKg?: string | number | null };
export type PublicOrderWeight = { totalWeightKg?: string | number | null; weightComplete?: boolean;
  missingWeightItems?: number; items?: PublicWeightItem[] };

function validWeight(value: unknown) {
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'string' && !value.trim())) return null;
  const weight = Number(value);
  return Number.isFinite(weight) && weight >= 0 ? weight : null;
}

export function formatOrderWeight(value: unknown) {
  const weight = validWeight(value);
  if (weight === null) return '—';
  if (weight > 0 && weight < 0.001) return '<0,001 кг';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(weight)} кг`;
}

/** Older API replies have no mass fields: unknown must never look like zero. */
export function publicOrderWeight(order: PublicOrderWeight) {
  const items = order.items ?? [];
  const known = items.map(item => validWeight(item.weightKg));
  const missing = known.filter(value => value === null).length;
  const hasTotal = validWeight(order.totalWeightKg) !== null;
  const total = hasTotal ? validWeight(order.totalWeightKg)
    : known.some(value => value !== null) ? known.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const complete = order.weightComplete === true && hasTotal && missing === 0;
  return { label: complete || total === null ? 'Вес заказа' : 'Известный вес',
    value: formatOrderWeight(total), complete, missing,
    description: complete ? 'Общий вес всех позиций заказа'
      : total === null ? 'Вес товаров не указан. Уточните у менеджера.'
        : missing ? `Итог неполный: вес не указан для ${missing} ${missing % 10 === 1 && missing % 100 !== 11 ? 'позиции' : 'позиций'}. Уточните у менеджера.`
          : 'Общий вес пока не подтверждён. Уточните у менеджера.' };
}
