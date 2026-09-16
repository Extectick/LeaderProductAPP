import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import TrackingServiceScreen from '../app/(main)/services/tracking';
import { fetchTrackingDay, fetchTrackingDayEvents, fetchTrackingLive, fetchTrackingUsers, requestLiveLocation, fetchLocationRequest } from '../utils/trackingService';
import { requestTrackingPosition } from '../utils/trackingV2Service';
import { trackingCalendarDate, trackingDayFromCalendar, trackingDayKey, trackingShiftDay } from '../src/features/tracking/trackingPresentation';

const mockReplace = jest.fn();
const mockClearLastService = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('../components/AppHeader', () => ({ AppHeader: (props: any) => require('react').createElement('AppHeader', props, props.titleSlot, props.rightSlot) }));
jest.mock('../components/Navigation/TabBarVisibilityContext', () => ({ useOptionalTabBarVisibility: () => null }));
jest.mock('../src/features/navigation/LastServiceRouteContext', () => ({ useOptionalLastServiceRoute: () => ({ clearLastServiceRoute: mockClearLastService }) }));
jest.mock('../src/features/tracking/TrackingDayPanel', () => (props: any) => require('react').createElement('DayPanel', props, props.dateControls, props.listProps.ListHeaderComponent));
jest.mock('../src/features/clientOrders/screen/mobile/SearchPickerScreen', () => ({ SearchPickerScreen: (props: any) => props.visible ? require('react').createElement('SearchPicker', props, props.data.map((item: any, index: number) => require('react').createElement(require('react').Fragment, { key: item.id }, props.renderItem({ item, index })))) : null }));
jest.mock('../app/(main)/services/tracking/TrackingMap', () => (props: any) => require('react').createElement('TrackingMap', props));
jest.mock('../utils/trackingService', () => ({ fetchTrackingUsers: jest.fn(), fetchTrackingDay: jest.fn(), fetchTrackingDayEvents: jest.fn(), fetchTrackingLive: jest.fn(), requestLiveLocation: jest.fn(), fetchLocationRequest: jest.fn() }));
jest.mock('../utils/tokenService', () => ({ getAuthDevicePayload: async () => ({ installId: 'this-phone' }) }));
jest.mock('../utils/trackingV2Service', () => ({ requestTrackingPosition: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) }));
jest.mock('react-native-paper', () => {
  const React = require('react');
  const host = (name: string) => (props: any) => React.createElement(name, props, props.children);
  const Dialog = Object.assign((props: any) => props.visible ? React.createElement('Dialog', props, props.children) : null, { Title: host('DialogTitle'), Content: host('DialogContent'), ScrollArea: host('DialogScrollArea'), Actions: host('DialogActions') });
  const Menu = Object.assign((props: any) => React.createElement('Menu', props, props.anchor, props.visible ? props.children : null), { Item: host('MenuItem') });
  return { ActivityIndicator: host('ActivityIndicator'), Avatar: { Image: host('AvatarImage'), Text: host('AvatarText') }, Button: host('Button'), Dialog, Divider: host('Divider'), Icon: host('Icon'), IconButton: host('IconButton'), List: { Item: host('ListItem'), Icon: host('ListIcon'), Subheader: host('ListSubheader') }, Menu, Portal: host('Portal'), Surface: host('Surface'), Text: host('PaperText'), TouchableRipple: host('TouchableRipple') };
});

const users = [{ id: 1, firstName: 'Алексей', avatarUrl: 'https://files.test/avatar.jpg', department: { id: 3, name: 'Продажи' }, role: { id: 1, name: 'manager', displayName: 'Менеджер' } }, { id: 2, firstName: 'Екатерина' }];
const today = trackingDayKey(new Date());
const yesterday = trackingShiftDay(today, -1);
const dayData = (day: string, pointsCount: number) => ({ day, timezoneOffsetMinutes: 360, summary: { pointsCount, distanceMeters: 1000, movingSeconds: 60, stopsCount: 0, ordersCount: 0, truncated: false }, polyline: [], stops: [], orderEvents: [] });
let screen: ReactTestRenderer;
const host = (name: string) => screen.root.findByType(name as any);
const button = (label: string) => screen.root.findAllByType('IconButton' as any).find((node) => node.props.accessibilityLabel === label)!;
const ripple = (label: string) => screen.root.findAllByType('TouchableRipple' as any).find((node) => node.props.accessibilityLabel?.startsWith(label))!;
const press = async (action: () => void) => { await act(async () => { action(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  (fetchTrackingUsers as jest.Mock).mockImplementation((_: string, options: any) => Promise.resolve(options?.self ? [users[1]] : users));
  (fetchTrackingDay as jest.Mock).mockImplementation((_: number, day: string) => Promise.resolve(dayData(day, 10)));
  (fetchTrackingLive as jest.Mock).mockResolvedValue({ point: null, device: { enabled: true } });
  (requestTrackingPosition as jest.Mock).mockResolvedValue(true);
});
afterEach(async () => {
  if (screen) await act(async () => screen.unmount());
  jest.useRealTimers();
});
async function renderScreen() {
  await act(async () => { screen = create(React.createElement(TrackingServiceScreen)); });
}

it('opens self rather than the first employee in the alphabetical list', async () => {
  await renderScreen();
  expect(fetchTrackingUsers).toHaveBeenCalledWith('', { self: true });
  expect(fetchTrackingDay).toHaveBeenCalledWith(2, today);
  expect(host('AppHeader').props.variant).toBe('flat');
});

it('moves between days immediately but blocks dates in the future', async () => {
  await renderScreen();
  expect(button('Следующий день').props.disabled).toBe(true);
  await press(() => button('Следующий день').props.onPress());
  expect(fetchTrackingDay).toHaveBeenCalledTimes(1);
  await press(() => button('Предыдущий день').props.onPress());
  expect(fetchTrackingDay).toHaveBeenLastCalledWith(2, yesterday);
  expect(button('Следующий день').props.disabled).toBe(false);
  await press(() => button('Следующий день').props.onPress());
  expect(host('TrackingMap').props.data.day).toBe(today);
});

it('opens the native calendar directly, preserves cancellation and rejects a future selection', async () => {
  await renderScreen();
  await press(() => ripple('Выбрать дату маршрута').props.onPress());
  const calendar = (DateTimePickerAndroid.open as jest.Mock).mock.calls[0][0];
  expect(trackingDayFromCalendar(calendar.maximumDate)).toBe(today);
  await press(() => calendar.onChange({ type: 'dismissed' }, trackingCalendarDate('2026-09-01')));
  await press(() => calendar.onChange({ type: 'set' }, trackingCalendarDate(trackingShiftDay(today, 1))));
  expect(fetchTrackingDay).toHaveBeenCalledTimes(1);
  await press(() => calendar.onChange({ type: 'set' }, trackingCalendarDate('2026-09-01')));
  expect(fetchTrackingDay).toHaveBeenLastCalledWith(2, '2026-09-01');
});

it('does not switch employees on search or let a delayed old response replace the new route', async () => {
  await renderScreen();
  let resolveOld: (value: unknown) => void = () => {};
  (fetchTrackingDay as jest.Mock).mockImplementation((user: number, day: string) => user === 2 ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve(dayData(day, 20)));
  await press(() => button('Меню геомаршрута').props.onPress());
  await press(() => screen.root.findAllByType('MenuItem' as any).find((node) => node.props.title === 'Обновить данные')!.props.onPress());
  await press(() => ripple('Выбрать сотрудника').props.onPress());
  (fetchTrackingUsers as jest.Mock).mockResolvedValue([users[0]]);
  await press(() => host('SearchPicker').props.onSearchChange('Продажи Менеджер'));
  expect(fetchTrackingUsers).toHaveBeenLastCalledWith('Продажи Менеджер', { offset: 0 });
  expect(fetchTrackingDay).toHaveBeenLastCalledWith(2, today);
  const employee = screen.root.findAllByType('ListItem' as any).find((node) => node.props.title === 'Алексей')!;
  expect(employee.props.description).toBe('Продажи · Менеджер');
  expect(employee.props.left().props.children.props.source.uri).toBe(users[0].avatarUrl);
  await press(() => employee.props.onPress());
  expect(host('TrackingMap').props.data.summary.pointsCount).toBe(20);
  await act(async () => { resolveOld(dayData('2026-09-16', 99)); });
  expect(host('TrackingMap').props.data.summary.pointsCount).toBe(20);
});

it('does not default to another employee if self has no eligible employee profile', async () => {
  (fetchTrackingUsers as jest.Mock).mockImplementation((_: string, options: any) => Promise.resolve(options?.self ? [] : users));
  await renderScreen();
  expect(fetchTrackingDay).not.toHaveBeenCalled();
  await press(() => ripple('Выбрать сотрудника').props.onPress());
  expect(host('SearchPicker').props.data).toHaveLength(2);
  expect(fetchTrackingDay).not.toHaveBeenCalled();
});

it('loads further employee pages once, without hiding the existing list', async () => {
  await renderScreen();
  const page = Array.from({ length: 100 }, (_, index) => ({ id: index + 10, firstName: `Сотрудник ${index}` }));
  (fetchTrackingUsers as jest.Mock).mockImplementation((_: string, options: any) => Promise.resolve(options?.offset ? [users[0]] : page));
  await press(() => ripple('Выбрать сотрудника').props.onPress());
  await press(() => { host('SearchPicker').props.onEndReached(); host('SearchPicker').props.onEndReached(); });
  expect(fetchTrackingUsers).toHaveBeenLastCalledWith('', { offset: 100 });
  expect(host('SearchPicker').props.data).toHaveLength(101);
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
  expect(trackingShiftDay('2026-03-01', -1)).toBe('2026-02-28');
  expect(trackingShiftDay('2026-12-31', 1)).toBe('2027-01-01');
});

it('keeps calendar actions inside the bottom panel without collapsing it', async () => {
  await renderScreen();
  expect(host('DayPanel').props.bottomInset).toBe(24);
  await press(() => host('DayPanel').props.onExpandedChange(true));
  await press(() => button('Предыдущий день').props.onPress());
  expect(host('DayPanel').props.expanded).toBe(true);
  await press(() => ripple('Выбрать дату маршрута').props.onPress());
  expect(host('DayPanel').props.expanded).toBe(true);
  await press(() => host('DayPanel').props.onRefresh());
  expect(fetchTrackingDay).toHaveBeenLastCalledWith(2, yesterday);
});

it('appends an events page on scrolling without reloading GPS or duplicating events', async () => {
  const event = (id: string) => ({ id, eventType: 'CREATED', capturedAt: '2026-09-16T06:00:00Z', latitude: null, longitude: null, order: { guid: id, number: id, counterpartyName: 'Клиент', totalAmount: 100 } });
  (fetchTrackingDay as jest.Mock).mockResolvedValue({ ...dayData(today, 10), orderEvents: [event('a')], orderEventsNextCursor: 'next' });
  (fetchTrackingDayEvents as jest.Mock).mockResolvedValue({ orderEvents: [event('a'), event('b')], orderEventsNextCursor: null });
  await renderScreen();
  await press(() => { host('DayPanel').props.listProps.onEndReached(); host('DayPanel').props.listProps.onEndReached(); });
  expect(fetchTrackingDayEvents).toHaveBeenCalledTimes(1);
  expect(fetchTrackingDay).toHaveBeenCalledTimes(1);
  expect(host('DayPanel').props.listProps.data).toHaveLength(2);
});

it('requests a fix on the current phone directly when native polling is not installed', async () => {
  (requestLiveLocation as jest.Mock).mockResolvedValue({ id: 'req', status: 'PENDING', expiresAt: new Date(Date.now() + 60000).toISOString(), delivery: 'local_device' });
  (fetchLocationRequest as jest.Mock).mockResolvedValue({ status: 'SUCCEEDED', point: { latitude: 55, longitude: 73 } });
  await renderScreen();
  await press(() => button('Меню геомаршрута').props.onPress());
  await press(() => screen.root.findAllByType('MenuItem' as any).find((node) => node.props.title === 'Запросить геопозицию')!.props.onPress());
  expect(requestLiveLocation).toHaveBeenCalledWith(2, 'this-phone');
  expect(requestTrackingPosition).toHaveBeenCalledWith('req');
  expect(host('TrackingMap').props.focus.latitude).toBe(55);
});

it('does not launch a duplicate JS fix when the native command channel handles it', async () => {
  (requestLiveLocation as jest.Mock).mockResolvedValue({ id: 'req', status: 'PENDING', expiresAt: new Date(Date.now() + 60000).toISOString(), delivery: 'native_poll' });
  (fetchLocationRequest as jest.Mock).mockResolvedValue({ status: 'SUCCEEDED' });
  await renderScreen();
  await press(() => button('Меню геомаршрута').props.onPress());
  await press(() => screen.root.findAllByType('MenuItem' as any).find((node) => node.props.title === 'Запросить геопозицию')!.props.onPress());
  expect(requestTrackingPosition).not.toHaveBeenCalled();
});
