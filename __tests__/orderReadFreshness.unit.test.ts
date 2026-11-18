import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {ReadSnapshotLabel} from '../src/features/clientOrders/components/ReadSnapshotLabel';
import {summaryFreshnessHint, orderProfitFreshnessHint} from '../src/features/clientOrders/lib/orderReadFreshness';
jest.mock('react-native-paper', () => ({Text: 'Text', Tooltip: 'Tooltip'}));
test('stale summary labels name the actual received snapshot and do not claim fresh data', () => {
  const summary = {stale: true, refreshPending: true, fetchedAt: '2026-11-17T10:00:00Z', calculatedAt: '2026-11-16T10:00:00Z'} as any;
  const hint = summaryFreshnessHint(summary);
  expect(hint).toContain('17.11.2026'); expect(hint).toContain('Обновляются');
  let tree!: Renderer.ReactTestRenderer;
  act(() => {tree = Renderer.create(React.createElement(ReadSnapshotLabel, {hint}));});
  expect(tree.root.findByType('Text' as any).props.children).toBe('Предыдущие данные');
  expect(tree.root.findByType('Text' as any).props.accessibilityLabel).toBe(hint);
  act(() => tree.update(React.createElement(ReadSnapshotLabel, {hint: summaryFreshnessHint({...summary, stale: false})})));
  expect(tree.toJSON()).toBeNull(); act(() => tree.unmount());
});
test('unknown profit is never displayed as an old zero-profit calculation', () => {
  const order = {profit: null, profitAvailable: false, profitFreshness: {status: 'unknown', checkedAt: null, refreshPending: true}} as any;
  expect(orderProfitFreshnessHint(order)).toBeNull();
  expect(orderProfitFreshnessHint({...order, profit: 0, profitAvailable: true, profitFreshness: {status: 'stale', checkedAt: '2026-11-17T10:00:00Z', refreshPending: false}})).toContain('Предыдущий расчёт');
});
