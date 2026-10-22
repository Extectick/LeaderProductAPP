import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSalesRange } from '../src/features/stockBalances/useSalesRange';

const period = { from: '2026-10-01', to: '2026-10-22' };
const page = (cursor: string, day = '2026-10-20', hasMore = true) => ({ items: [{ movementAt: day }], nextCursor: cursor, hasMore }) as any;
let value: ReturnType<typeof useSalesRange>;
let view: TestRenderer.ReactTestRenderer;
function Probe(props: any) { value = useSalesRange(props.history, period, props.scope, props.enabled); return null; }
afterEach(() => { if (view) act(() => view.unmount()); });
it('drains sequentially once per page and stops at the lower date boundary', () => {
  const loadMore = jest.fn();
  let history = { page: page('one'), busy: false, error: null, loadMore };
  const render = () => React.createElement(Probe, { history, scope: 'a', enabled: true });
  act(() => { view = TestRenderer.create(render()); });
  expect(loadMore).toHaveBeenCalledTimes(1);
  act(() => view.update(render()));
  expect(loadMore).toHaveBeenCalledTimes(1);
  history = { ...history, page: page('two'), busy: true };
  act(() => view.update(render()));
  expect(loadMore).toHaveBeenCalledTimes(1);
  history = { ...history, busy: false };
  act(() => view.update(render()));
  expect(loadMore).toHaveBeenCalledTimes(2);
  history = { ...history, page: page('three', '2026-09-30') };
  act(() => view.update(render()));
  expect(value.complete).toBe(true);
  expect(loadMore).toHaveBeenCalledTimes(2);
});
it('reports a repeated cursor instead of displaying partial totals; a new scope can retry', () => {
  const loadMore = jest.fn();
  let history = { page: page('one'), busy: false, error: null, loadMore };
  act(() => { view = TestRenderer.create(React.createElement(Probe, { history, scope: 'a', enabled: true })); });
  history = { ...history, page: page('one') };
  act(() => view.update(React.createElement(Probe, { history, scope: 'a', enabled: true })));
  expect(value.error).toMatch('весь период');
  expect(value.complete).toBe(false);
  expect(loadMore).toHaveBeenCalledTimes(1);
  act(() => view.update(React.createElement(Probe, { history, scope: 'b', enabled: true })));
  expect(value.error).toBeNull();
  expect(loadMore).toHaveBeenCalledTimes(2);
});
it('does not load a hidden/offline tab or retry a transport error automatically', () => {
  const loadMore = jest.fn();
  let history: any = { page: page('one'), busy: false, error: null, loadMore };
  act(() => { view = TestRenderer.create(React.createElement(Probe, { history, scope: 'a', enabled: false })); });
  expect(loadMore).not.toHaveBeenCalled();
  history = { ...history, error: 'Network error' };
  act(() => view.update(React.createElement(Probe, { history, scope: 'a', enabled: true })));
  expect(value.error).toBe('Network error');
  expect(loadMore).not.toHaveBeenCalled();
});
