import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useTable, type ColumnOrderState, type ColumnSizingState } from '@tanstack/react-table';
import { draftTableFeatures } from '../src/features/clientOrders/screen/desktop/draftItemsTableFeatures';

const rows = [{ id: 7, name: 'Товар', quantity: 2 }];
const columns = [{ accessorKey: 'name' }, { accessorKey: 'quantity' }];

test('v9 draft table keeps controlled column ordering, sizing and visible row cells', async () => {
  let table!: ReturnType<typeof useTable>;
  function Harness() {
    const [columnSizing, onColumnSizingChange] = React.useState<ColumnSizingState>({});
    const [columnOrder, onColumnOrderChange] = React.useState<ColumnOrderState>([]);
    const current = useTable({
      features: draftTableFeatures,
      data: rows,
      columns,
      state: { columnSizing, columnOrder },
      onColumnSizingChange,
      onColumnOrderChange,
      columnResizeMode: 'onChange',
    });
    table = current;
    return null;
  }
  let screen!: TestRenderer.ReactTestRenderer;
  try {
    await act(async () => { screen = TestRenderer.create(React.createElement(Harness)); });
    expect(table.getRowModel().rows[0].original).toBe(rows[0]);
    await act(async () => { table.setColumnOrder(['quantity', 'name']); });
    expect(table.getVisibleLeafColumns().map(column => column.id)).toEqual(['quantity', 'name']);
    await act(async () => { table.setColumnSizing({ name: 240 }); });
    expect(table.getColumn('name')!.getSize()).toBe(240);
    expect(typeof table.getHeaderGroups()[0].headers[0].getResizeHandler()).toBe('function');
    expect(table.getRowModel().rows[0].getVisibleCells().map(cell => cell.getValue())).toEqual([2, 'Товар']);
  } finally {
    if (screen) await act(async () => screen.unmount());
  }
});
