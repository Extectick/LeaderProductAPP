import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet, View } from 'react-native';
import TrackingDayPanel from '../src/features/tracking/TrackingDayPanel.native';
import type { TrackingDayPanelProps } from '../src/features/tracking/TrackingDayPanel.types';

const mockHeaderMounted = jest.fn();
const mockHeaderUnmounted = jest.fn();
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ snapToIndex: jest.fn() }));
      return React.createElement('BottomSheet', props, React.createElement(props.handleComponent), props.children);
    }),
    BottomSheetFlatList: (props: any) => React.createElement('SheetList', props),
  };
});
jest.mock('../src/features/tracking/TrackingDayPanelHeader', () => (props: any) => {
  const React = require('react');
  React.useEffect(() => {
    mockHeaderMounted();
    return mockHeaderUnmounted;
  }, []);
  return React.createElement('PanelHeader', props, props.dateControls, props.navigation);
});

let screen: ReactTestRenderer;
let props: TrackingDayPanelProps;
const sheet = () => screen.root.findByType('BottomSheet' as any);
const header = () => screen.root.findByType('PanelHeader' as any);
const layout = async (height: number) => {
  await act(async () => header().props.onLayout({ nativeEvent: { layout: { height } } }));
};
const update = async (patch: Partial<TrackingDayPanelProps>) => {
  props = { ...props, ...patch };
  await act(async () => screen.update(React.createElement(TrackingDayPanel, props)));
};

beforeEach(async () => {
  jest.clearAllMocks();
  props = {
    summary: 'Загружаем маршрут', expanded: false, onExpandedChange: jest.fn(),
    bottomInset: 24, dateControls: React.createElement('DateControls'),
    navigation: null, onHeaderHeightChange: jest.fn(), onRefresh: jest.fn(),
    refreshing: true, refreshDisabled: false, listProps: { data: [], renderItem: () => null },
  };
  await act(async () => { screen = create(React.createElement(TrackingDayPanel, props)); });
});
afterEach(async () => { await act(async () => screen.unmount()); });

it('keeps the measured handle mounted as the route, controls and refresh state update', async () => {
  const handle = sheet().props.handleComponent;
  await layout(96);
  await update({ summary: '3,7 км · остановки: 0 · заказы: 0', refreshing: false,
    dateControls: React.createElement('DateControls', { day: '2026-09-20' }),
    navigation: React.createElement('PointNavigation'), onRefresh: jest.fn(),
  });
  await layout(172);
  expect(sheet().props.handleComponent).toBe(handle);
  expect(mockHeaderMounted).toHaveBeenCalledTimes(1);
  expect(mockHeaderUnmounted).not.toHaveBeenCalled();
  expect(header().props.summary).toBe(props.summary);
  expect(header().props.refreshing).toBe(false);
  expect(screen.root.findByType('PointNavigation' as any)).toBeDefined();
  expect(sheet().props.snapPoints).toEqual([196, '78%']);
  expect(props.onHeaderHeightChange).toHaveBeenLastCalledWith(172);
});

it('keeps the collapsed height equal to the current full header and one safe-area inset', async () => {
  await layout(172.2);
  expect(sheet().props.snapPoints[0]).toBe(197);
  await update({ bottomInset: 0 });
  await layout(96);
  expect(sheet().props.snapPoints[0]).toBe(96);
  expect(sheet().props.bottomInset).toBe(0);
  expect(sheet().props.enableDynamicSizing).toBe(false);
  expect(sheet().props.animateOnMount).toBe(false);
});

it('does not replace a valid measurement with transient zero or invalid layout events', async () => {
  await layout(172);
  for (const height of [0, -1, NaN, Infinity]) await layout(height);
  expect(sheet().props.snapPoints[0]).toBe(196);
  expect(props.onHeaderHeightChange).toHaveBeenCalledTimes(1);
});

it('controls the sheet index rather than keeping a competing collapsed index during expansion', async () => {
  await layout(172);
  await update({ expanded: true });
  expect(sheet().props.index).toBe(1);
  expect(header().props.expanded).toBe(true);
  await act(async () => header().props.onPress());
  expect(props.onExpandedChange).toHaveBeenLastCalledWith(false);
  await update({ expanded: false });
  expect(sheet().props.index).toBe(0);
  expect(mockHeaderMounted).toHaveBeenCalledTimes(1);
});

it('does not collapse the measured native handle into a Fabric layout-only node', () => {
  const wrapper = screen.root.findByType(View);
  expect(wrapper.props.collapsable).toBe(false);
  expect(StyleSheet.flatten(wrapper.props.style)).toMatchObject({ flexShrink: 0, paddingBottom: 24 });
});
