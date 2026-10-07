import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

let mockUpdatesState: Record<string, any>;
const mockReload = jest.fn();
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-updates', () => ({
  isEnabled: true, updateId: 'running', runtimeVersion: 'test',
  useUpdates: () => mockUpdatesState, reloadAsync: () => mockReload(),
}));

let useStartupOtaUpdate: typeof import('../hooks/useStartupOtaUpdate').useStartupOtaUpdate;
let result: ReturnType<typeof useStartupOtaUpdate>;
let screen: ReactTestRenderer;
const development = __DEV__;
function Probe() { result = useStartupOtaUpdate(true); return null; }
beforeAll(() => {
  (globalThis as any).__DEV__ = false;
  useStartupOtaUpdate = require('../hooks/useStartupOtaUpdate').useStartupOtaUpdate;
});
afterAll(() => { (globalThis as any).__DEV__ = development; });
beforeEach(() => {
  jest.useFakeTimers();
  mockReload.mockReset().mockResolvedValue(undefined);
  mockUpdatesState = { isStartupProcedureRunning: false, isChecking: false, isDownloading: false,
    isUpdatePending: false, currentlyRunning: { updateId: 'running' } };
});
afterEach(async () => {
  if (screen) await act(async () => screen.unmount());
  await act(async () => jest.advanceTimersByTime(8000));
  jest.useRealTimers();
});
async function mount() { await act(async () => { screen = create(React.createElement(Probe)); }); }

it('enters immediately when native updates are idle without a 2.5 second grace period', async () => {
  await mount();
  expect(result.ready).toBe(true);
  expect(mockReload).not.toHaveBeenCalled();
});
it.each([false, true])('does not restart the running bundle even with stale pending=%s', async (pending) => {
  mockUpdatesState.isUpdatePending = pending;
  mockUpdatesState.downloadedUpdate = { updateId: 'running' };
  await mount();
  expect(result.ready).toBe(true);
  expect(mockReload).not.toHaveBeenCalled();
});
it('applies a genuinely pending new update without an artificial reload delay', async () => {
  mockUpdatesState.isUpdatePending = true;
  mockUpdatesState.downloadedUpdate = { updateId: 'new-update' };
  await mount();
  expect(mockReload).toHaveBeenCalledTimes(1);
});
it('does not treat download metadata alone as a pending update', async () => {
  mockUpdatesState.downloadedUpdate = { updateId: 'old-download' };
  await mount();
  expect(result.ready).toBe(true);
  expect(mockReload).not.toHaveBeenCalled();
});
it('continues on a reload error instead of leaving the splash blocked', async () => {
  mockUpdatesState.isUpdatePending = true;
  mockUpdatesState.downloadedUpdate = { updateId: 'new-update' };
  mockReload.mockRejectedValue(new Error('reload unavailable'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await mount();
  expect(result.ready).toBe(true);
  expect(result.phase).toBe('error');
  warning.mockRestore();
});
it('does not block entry on a native background download or reload after it finishes', async () => {
  mockUpdatesState.isDownloading = true;
  mockUpdatesState.downloadProgress = 0.37;
  await mount();
  expect(result.ready).toBe(true);
  mockUpdatesState = { ...mockUpdatesState, isDownloading: false, isUpdatePending: true, downloadedUpdate: { updateId: 'new-update' } };
  await act(async () => screen.update(React.createElement(Probe)));
  await act(async () => jest.advanceTimersByTime(250));
  expect(result.ready).toBe(true);
  expect(mockReload).not.toHaveBeenCalled();
});
it.each(['isStartupProcedureRunning', 'isChecking'])('does not wait for native %s', async (key) => {
  mockUpdatesState[key] = true;
  await mount();
  expect(result.ready).toBe(true);
  expect(mockReload).not.toHaveBeenCalled();
});
it('releases the splash when native reload never resolves and ignores its late completion', async () => {
  let resolveReload!: () => void;
  mockReload.mockImplementation(() => new Promise<void>((resolve) => { resolveReload = resolve; }));
  mockUpdatesState.isUpdatePending = true;
  mockUpdatesState.downloadedUpdate = { updateId: 'new-update' };
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await mount();
  expect(result.phase).toBe('applying');
  await act(async () => jest.advanceTimersByTime(8000));
  expect(result.ready).toBe(true);
  expect(result.phase).toBe('error');
  await act(async () => resolveReload());
  expect(result.phase).toBe('error');
  expect(mockReload).toHaveBeenCalledTimes(1);
  warning.mockRestore();
});
it('performs only one reload when StrictMode replays startup effects', async () => {
  mockUpdatesState.isUpdatePending = true;
  mockUpdatesState.downloadedUpdate = { updateId: 'new-update' };
  await act(async () => { screen = create(React.createElement(React.StrictMode, null, React.createElement(Probe))); });
  expect(mockReload).toHaveBeenCalledTimes(1);
});
it('does not extend the reload deadline when native state changes', async () => {
  mockReload.mockImplementation(() => new Promise(() => {}));
  mockUpdatesState.isUpdatePending = true;
  mockUpdatesState.downloadedUpdate = { updateId: 'new-update' };
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await mount();
  await act(async () => jest.advanceTimersByTime(4000));
  mockUpdatesState = { ...mockUpdatesState, isChecking: true };
  await act(async () => screen.update(React.createElement(Probe)));
  await act(async () => jest.advanceTimersByTime(4000));
  expect(result.ready).toBe(true);
  expect(result.phase).toBe('error');
  expect(mockReload).toHaveBeenCalledTimes(1);
  warning.mockRestore();
});
