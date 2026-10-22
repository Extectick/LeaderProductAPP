import type { StockDetail } from './products';
import type { SelectedWarehouse } from './useWarehouseSelection';

export type WarehouseGroup = { key: string; name: string; items: SelectedWarehouse[] };
export type BalanceRow = { kind: 'folder'; id: string; name: string; count: number; expanded: boolean }
  | { kind: 'balance'; id: string; item: StockDetail; indented: boolean };

export function selectedWarehouseRows<T extends { warehouse: { guid: string } }>(items: T[], selected: SelectedWarehouse[]): T[] {
  if (!selected.length) return items;
  const ids = new Set(selected.map(w => w.guid.toLowerCase()));
  return items.filter(row => ids.has(row.warehouse.guid.toLowerCase()));
}

/** A checked folder in the existing picker means all its warehouse members are selected. */
export function warehouseBalanceRows(items: StockDetail[], selected: SelectedWarehouse[], groups: WarehouseGroup[], collapsed: ReadonlySet<string>): BalanceRow[] {
  const visible = selectedWarehouseRows(items, selected);
  const ids = new Set(selected.map(w => w.guid.toLowerCase()));
  const placed = new Set<string>();
  const rows: BalanceRow[] = [];
  for (const group of groups) {
    if (!group.items.length || !group.items.every(w => ids.has(w.guid.toLowerCase()))) continue;
    const members = new Set(group.items.map(w => w.guid.toLowerCase()));
    const children = visible.filter(row => members.has(row.warehouse.guid.toLowerCase()) && !placed.has(row.id));
    if (!children.length) continue;
    children.forEach(row => placed.add(row.id));
    const expanded = !collapsed.has(group.key);
    rows.push({ kind: 'folder', id: group.key, name: group.name, count: children.length, expanded });
    if (expanded) children.forEach(item => rows.push({ kind: 'balance', id: item.id, item, indented: true }));
  }
  visible.filter(row => !placed.has(row.id)).forEach(item => rows.push({ kind: 'balance', id: item.id, item, indented: false }));
  return rows;
}
