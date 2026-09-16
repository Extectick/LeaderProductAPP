import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import TrackingServiceScreen from '../app/(main)/services/tracking';
import { fetchTrackingDay, fetchTrackingLive, fetchTrackingUsers } from '../utils/trackingService';
import { trackingCalendarDate, trackingDayFromCalendar, trackingDayKey } from '../src/features/tracking/trackingPresentation';

const mockReplace = jest.fn();
const mockClearLastService = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('../components/AppHeader', () => ({ AppHeader: (props: any) => require('react').createElement('AppHeader', props, props.titleSlot, props.rightSlot) }));
jest.mock('../components/Navigation/TabBarVisibilityContext', () => ({ useOptionalTabBarVisibility: () => null }));
jest.mock('../src/features/navigation/LastServiceRouteContext', () => ({ useOptionalLastServiceRoute: () => ({ clearLastServiceRoute: mockClearLastService }) }));
jest.mock('../src/features/tracking/TrackingDayPanel', () => (props: any) => require('react').createElement('DayPanel', props, props.children));
jest.mock('../app/(main)/services/tracking/TrackingMap', () => (props: any) => require('react').createElement('TrackingMap', props));
jest.mock('../utils/trackingService', () => ({ fetchTrackingUsers: jest.fn(), fetchTrackingDay: jest.fn(), fetchTrackingLive: jest.fn(), requestLiveLocation: jest.fn(), fetchLocationRequest: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) }));
jest.mock('react-native-paper', () => {
  const React = require('react');
  const host = (name: string) => (props: any) => React.createElement(name, props, props.children);
  const Dialog = Object.assign((props: any) => props.visible ? React.createElement('Dialog', props, props.children) : null, { Title: host('DialogTitle'), Content: host('DialogContent'), ScrollArea: host('DialogScrollArea'), Actions: host('DialogActions') });
  const Menu = Object.assign((props: any) => React.createElement('Menu', props, props.anchor, props.visible ? props.children : null), { Item: host('MenuItem') });
  return { ActivityIndicator: host('ActivityIndicator'), Button: host('Button'), Dialog, Divider: host('Divider'), Icon: host('Icon'), IconButton: host('IconButton'), List: { Item: host('ListItem'), Icon: host('ListIcon'), Subheader: host('ListSubheader') }, Menu, Portal: host('Portal'), Searchbar: host('Searchbar'), SegmentedButtons: host('SegmentedButtons'), Surface: host('Surface'), Text: host('PaperText'), TouchableRipple: host('TouchableRipple') };
});

const users = [{ id: 1, firstName: 'Алексей' }, { id: 2, firstName: 'Екатерина' }];
const dayData = (day: string, pointsCount: number) => ({ day, timezoneOffsetMinutes: 360, summary: { pointsCount, distanceMeters: 1000, movingSeconds: 60, stopsCount: 0, ordersCount: 0, truncated: false }, polyline: [], stops: [], orderEvents: [] });
let screen: ReactTestRenderer;
const host = (name: string) => screen.root.findByType(name as any);
const button = (label: string) => screen.root.findAllByType('IconButton' as any).find((node) => node.props.accessibilityLabel === label)!;
const press = async (action: () => void) => { await act(async () => { action(); }); };

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-09-16T10:00:00Z'));
  jest.clearAllMocks();
  (fetchTrackingUsers as jest.Mock).mockResolvedValue(users);
  (fetchTrackingDay as jest.Mock).mockImplementation((_: number, day: string) => Promise.resolve(dayData(day, 10)));
  (fetchTrackingLive as jest.Mock).mockResolvedValue({ point: null, device: { enabled: true } });
});
afterEach(async () => {
  if (screen) await act(async () => screen.unmount());
  jest.useRealTimers();
});
async function renderScreen() {
  await act(async () => { screen = create(React.createElement(TrackingServiceScreen)); });
  await act(async () => { await jest.advanceTimersByTimeAsync(1); });
}

it('applies the selected day only after confirmation, and preserves it on cancel', async () => {
  await renderScreen();
  await press(() => button('Фильтр по дате').props.onPress());
  await press(() => host('SegmentedButtons').props.onValueChange('yesterday'));
  expect(fetchTrackingDay).toHaveBeenCalledTimes(1);
  await press(() => screen.root.findAllByType('Button' as any).find((node) => node.props.children === 'Отмена')!.props.onPress());
  expect(host('TrackingMap').props.data.day).toBe('2026-09-16');
  await press(() => button('Фильтр по дате').props.onPress());
  await press(() => host('SegmentedButtons').props.onValueChange('yesterday'));
  await press(() => screen.root.findAllByType('Button' as any).find((node) => node.props.children === 'Показать')!.props.onPress());
  expect(fetchTrackingDay).toHaveBeenLastCalledWith(1, '2026-09-15');
  expect(host('TrackingMap').props.data.day).toBe('2026-09-15');
});

it('does not switch employees on search or let a delayed old response replace the new route', async () => {
  await renderScreen();
  let resolveOld: (value: unknown) => void = () => {};
  (fetchTrackingDay as jest.Mock).mockImplementation((user: number, day: string) => user === 1 ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve(dayData(day, 20)));
  await press(() => button('Меню геомаршрута').props.onPress());
  await press(() => screen.root.findAllByType('MenuItem' as any).find((node) => node.props.title === 'Обновить данные')!.props.onPress());
  await press(() => host('TouchableRipple').props.onPress());
  (fetchTrackingUsers as jest.Mock).mockResolvedValue([users[1]]);
  await press(() => host('Searchbar').props.onChangeText('Екатерина'));
  await act(async () => { await jest.advanceTimersByTimeAsync(301); });
  expect(fetchTrackingDay).toHaveBeenLastCalledWith(1, '2026-09-16');
  await press(() => screen.root.findAllByType('ListItem' as any).find((node) => node.props.title === 'Екатерина')!.props.onPress());
  expect(host('TrackingMap').props.data.summary.pointsCount).toBe(20);
  await act(async () => { resolveOld(dayData('2026-09-16', 99)); });
  expect(host('TrackingMap').props.data.summary.pointsCount).toBe(20);
});

it('returns to the services catalog and clears the automatic return route', async () => {
  await renderScreen();
  await press(() => host('AppHeader').props.onBack());
  expect(mockClearLastService).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/services');
});

it('preserves a calendar selection near timezone and month boundaries', () => {
  expect(trackingDayKey(new Date('2026-09-30T18:01:00Z'))).toBe('2026-10-01');
  expect(trackingDayFromCalendar(trackingCalendarDate('2026-09-01'))).toBe('2026-09-01');
  expect(trackingDayFromCalendar(new Date(2026, 8, 16, 23, 59))).toBe('2026-09-16');
});
