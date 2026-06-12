export function hasMorePage(itemsCount: number, limit: number, offset: number, total?: number | null) {
  if (itemsCount <= 0) return false;
  const loaded = offset + itemsCount;
  return typeof total === 'number' && total >= 0 ? loaded < total : itemsCount >= limit;
}
