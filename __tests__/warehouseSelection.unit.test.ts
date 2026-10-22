import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useWarehouseSelection, toggleWarehouse, toggleWarehouseGroup, warehouseSelectionLabel } from '../src/features/stockBalances/useWarehouseSelection';
jest.mock('../utils/config', () => ({ API_BASE_URL: 'https://dev.invalid' }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const data = new Map();
  return { getItem: jest.fn(async (key: string) => data.get(key) ?? null), setItem: jest.fn(async (key: string, value: string) => { data.set(key, value); }) };
});
const a = { guid: 'a', name: 'Омск' }, b = { guid: 'b', name: 'Новосибирск' };
it('labels all, one and multiple warehouses and toggles without duplicates', () => {
  expect(warehouseSelectionLabel([])).toBe('Склады (Все)');
  expect(warehouseSelectionLabel([a])).toBe('Омск');
  expect(warehouseSelectionLabel([a, b])).toBe('Склады (2)');
  expect(toggleWarehouse([a], b)).toEqual([a, b]);
  expect(toggleWarehouse([a, b], a)).toEqual([b]);
  expect(toggleWarehouse([a, b], { guid: '', name: 'Все' })).toEqual([]);
});
it('restores choices after remount, isolates users and persists the reset to all', async () => {
  let output!: ReturnType<typeof useWarehouseSelection>;
  let view!: TestRenderer.ReactTestRenderer;
  function Probe({ user }: { user: string }) { output = useWarehouseSelection(user); return null; }
  await act(async () => { view = TestRenderer.create(React.createElement(Probe, { user: 'u1' })); });
  expect(output.ready).toBe(true); expect(output.items).toEqual([]);
  await act(async () => { output.save([a, b]); });
  act(() => view.unmount());
  await act(async () => { view = TestRenderer.create(React.createElement(Probe, { user: 'u1' })); });
  expect(output.items).toEqual([a, b]);
  await act(async () => view.update(React.createElement(Probe, { user: 'u2' })));
  expect(output.items).toEqual([]);
  await act(async () => view.update(React.createElement(Probe, { user: 'u1' })));
  expect(output.items).toEqual([a, b]);
  await act(async () => { output.save([]); });
  act(() => view.unmount());
  await act(async () => { view = TestRenderer.create(React.createElement(Probe, { user: 'u1' })); });
  expect(output.items).toEqual([]);
  act(() => view.unmount());
});
it('toggles whole groups, fills partial selection and preserves other groups without duplicates', () => {
  const c = { guid: 'c', name: 'Переработка' };
  expect(toggleWarehouseGroup([], [a, c])).toEqual([a, c]);
  expect(toggleWarehouseGroup([a, b], [a, c])).toEqual([a, b, c]);
  expect(toggleWarehouseGroup([a, b, c], [a, c])).toEqual([b]);
  expect(toggleWarehouseGroup([a, c], [a, c])).toEqual([]);
  expect(toggleWarehouseGroup([a], [])).toEqual([a]);
});
