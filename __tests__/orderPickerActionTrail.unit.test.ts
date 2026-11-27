import { Platform } from 'react-native';
import { makeAppErrorPayload, readAppErrorPayload } from '@/src/shared/monitoring/appErrorPayload';
import { recentPickerActions, recordPickerAction, type PickerAction } from '@/src/shared/monitoring/pickerActions';
import { setMonitoringScreen, setMonitoringUser } from '@/src/shared/monitoring';

jest.mock('expo', () => ({ uuid: { v4: () => '68b5162b-d863-43ad-b694-53cff1972e62' } }));
jest.mock('expo-updates', () => ({}));
jest.mock('expo-application', () => ({}));
jest.mock('@/utils/appVersion', () => ({ getAppVersionInfo: () => ({}) }));
jest.mock('@/utils/logger', () => ({ logger: { captureException: jest.fn() } }));
jest.mock('@/src/shared/monitoring/nativeAppErrors', () => ({
  updateNativeAppErrorIdentity: jest.fn(), updateNativeAppErrorScreen: jest.fn(),
}));
jest.mock('@/src/shared/monitoring/nativeDiagnostics', () => ({
  getNativeDiagnostics: () => null, invokeNativeDiagnostic: jest.fn(),
}));

const orders = '(main)/services/client_orders';
const owner = 101;
const event = { ownerId: owner, source: 'react_boundary', screen: 'orders', stage: 'product-picker', error: new Error() } as const;

beforeEach(async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await setMonitoringUser(owner);
  setMonitoringScreen(orders);
});

afterEach(async () => {
  await setMonitoringUser(null);
  jest.restoreAllMocks();
});

it('snapshots only the last twelve actions for Android orders boundary and global error reports', () => {
  recordPickerAction(owner, 'picker_open');
  for (let i = 0; i < 12; i++) recordPickerAction(owner, 'quantity_plus');
  recordPickerAction(owner, 'quantity_minus');
  recordPickerAction(owner, 'private search text' as PickerAction);
  const expected = [...Array(11).fill('quantity_plus'), 'quantity_minus'];
  const boundary = makeAppErrorPayload(event)!;
  const global = makeAppErrorPayload({ ...event, source: 'global_js' })!;
  recordPickerAction(owner, 'picker_open');
  expect(recentPickerActions(owner)).toEqual(['picker_open']);
  for (const payload of [boundary, global]) {
    expect(payload.pickerActions).toEqual(expected);
    expect(readAppErrorPayload(JSON.stringify(payload), payload.eventId)?.pickerActions).toEqual(expected);
  }
  expect(makeAppErrorPayload({ ...event, source: 'captured' })).not.toHaveProperty('pickerActions');
  expect(makeAppErrorPayload({ ...event, screen: 'help' })).not.toHaveProperty('pickerActions');
  jest.replaceProperty(Platform, 'OS', 'ios');
  expect(makeAppErrorPayload(event)).not.toHaveProperty('pickerActions');
});

it('clears the trace when leaving orders or switching accounts and ignores stale owner callbacks', async () => {
  recordPickerAction(owner, 'search_changed');
  setMonitoringScreen(orders);
  expect(recentPickerActions(owner)).toEqual(['search_changed']);
  setMonitoringScreen('(main)/services/help');
  recordPickerAction(owner, 'editor_open');
  setMonitoringScreen(orders);
  expect(recentPickerActions(owner)).toBeUndefined();
  recordPickerAction(owner, 'page_append');
  await setMonitoringUser(owner + 1);
  recordPickerAction(owner, 'quantity_input');
  expect(makeAppErrorPayload({ ...event, ownerId: owner + 1 })).not.toHaveProperty('pickerActions');
  recordPickerAction(owner + 1, 'search_cleared');
  expect(makeAppErrorPayload(event)).not.toHaveProperty('pickerActions');
  await setMonitoringUser(null);
  expect(recentPickerActions(owner + 1)).toBeUndefined();
});

it('preserves old reports and strips malformed or out-of-scope action lists on queue restoration', () => {
  const base = makeAppErrorPayload(event)!;
  for (const extra of [{}, { pickerActions: [] }, { pickerActions: ['private product'] },
    { pickerActions: Array(13).fill('quantity_plus') }, { pickerActions: [{ id: 12 }] },
    { screen: 'help', pickerActions: ['editor_close'] }]) {
    const restored = readAppErrorPayload(JSON.stringify({ ...base, ...extra }), base.eventId);
    expect(restored).not.toBeNull();
    expect(restored).not.toHaveProperty('pickerActions');
  }
});
