import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/utils/config';
export type SelectedWarehouse = { guid: string; name: string; cityGuid?: string | null; cityName?: string | null; sortOrder?: number | null };
export const warehouseSelectionLabel = (items: SelectedWarehouse[]) => items.length > 1 ? `Склады (${items.length})` : items[0]?.name || 'Склады (Все)';
export function toggleWarehouse(items: SelectedWarehouse[], item: SelectedWarehouse) {
  return !item.guid ? [] : items.some(w => w.guid === item.guid) ? items.filter(w => w.guid !== item.guid) : [...items, item];
}
export function toggleWarehouseGroup(items: SelectedWarehouse[], group: readonly SelectedWarehouse[]) {
  const members = group.filter(w => !!w.guid);
  if (!members.length) return items;
  const ids = new Set(members.map(w => w.guid));
  return members.every(w => items.some(item => item.guid === w.guid))
    ? items.filter(w => !ids.has(w.guid))
    : [...new Map([...items, ...members].map(w => [w.guid, w])).values()];
}
let writes = Promise.resolve();
export function useWarehouseSelection(userId: string | undefined) {
  const key = userId ? `stock-warehouses-v1:${API_BASE_URL}:${userId}` : null;
  const [state, setState] = React.useState<{ key: string | null; items: SelectedWarehouse[] }>({ key: null, items: [] });
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    setError(false);
    if (!key) return;
    void writes.then(() => AsyncStorage.getItem(key)).then(raw => {
      const parsed = JSON.parse(raw || '[]');
      const unique = new Map<string, SelectedWarehouse>();
      if (Array.isArray(parsed)) parsed.slice(0, 100).forEach(item => {
        if (item && typeof item.guid === 'string' && item.guid && typeof item.name === 'string') unique.set(item.guid, item);
      });
      if (active) setState({ key, items: [...unique.values()] });
    }).catch(() => { if (active) { setState({ key, items: [] }); setError(true); } });
    return () => { active = false; };
  }, [key]);
  const save = (items: SelectedWarehouse[]) => {
    if (!key) return;
    setState({ key, items }); setError(false);
    writes = writes.then(() => AsyncStorage.setItem(key, JSON.stringify(items))).catch(() => { setError(true); });
  };
  return { items: state.key === key ? state.items : [], ready: !!key && state.key === key, save, error };
}
