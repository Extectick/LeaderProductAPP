import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import UpdateGate from '@/components/UpdateGate';
import { useAppUpdateStatus, type AppBinaryUpdateStatusContextValue } from '@/src/shared/appUpdate/AppUpdateStatusContext';
import { requestAppUpdateCheck } from '@/utils/updateCheckRequests';

const mockCheck = jest.fn();
const mockLog = jest.fn(async () => undefined);
const mockMount = jest.fn();
const mockUnmount = jest.fn();
const mockAppStateListeners = new Set<(state: string) => void>();
let mockStatus: AppBinaryUpdateStatusContextValue;

jest.mock('react-native', () => {
  const React = require('react');
  return {
    ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View',
    Modal: ({ visible, children, ...props }: any) => visible ? React.createElement('Modal', props, children) : null,
    Platform: { OS: 'android' }, Linking: { openURL: jest.fn() },
    StyleSheet: { create: (styles: any) => styles, absoluteFill: { position: 'absolute' } },
    AppState: { currentState: 'active', addEventListener: (_: string, listener: (state: string) => void) => {
      mockAppStateListeners.add(listener);
      return { remove: () => mockAppStateListeners.delete(listener) };
    } },
  };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined),
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0.1.31', nativeBuildVersion: '30' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { android: { versionCode: 30 } } } }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/' }));
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn() }));
jest.mock('@/utils/androidApkDownload', () => ({ isAndroidApkDownloadSupported: () => false }));
jest.mock('@/utils/updateService', () => ({
  checkForUpdate: (...args: unknown[]) => mockCheck(...args),
  getInstallId: async () => 'install-test', logUpdateEvent: () => mockLog(),
}));
jest.mock('@/src/shared/appUpdate/GlobalUpdateBanner', () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => require('react').createElement('UpdateBanner', props, children),
}));

function Content() {
  mockStatus = useAppUpdateStatus();
  useEffect(() => { mockMount(); return () => mockUnmount(); }, []);
  return React.createElement('ScreenContent', null, 'Документы');
}
let screen: TestRenderer.ReactTestRenderer;
beforeEach(() => {
  jest.useFakeTimers();
  mockCheck.mockReset(); mockLog.mockClear(); mockMount.mockClear(); mockUnmount.mockClear();
  mockCheck.mockResolvedValue({ ok: true, data: { updateAvailable: false, mandatory: false } });
});
afterEach(async () => {
  if (screen) await act(async () => screen.unmount());
  expect(mockAppStateListeners.size).toBe(0);
  jest.useRealTimers();
});
async function render() {
  await act(async () => { screen = TestRenderer.create(React.createElement(UpdateGate, null, React.createElement(Content))); });
}
function expectContentOnly() {
  expect(screen.root.findAllByType('ScreenContent' as any)).toHaveLength(1);
  expect(screen.root.findAllByType('Modal' as any)).toHaveLength(0);
  expect(screen.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
  expect(mockMount).toHaveBeenCalledTimes(1);
  expect(mockUnmount).not.toHaveBeenCalled();
}
async function resume() {
  await act(async () => {
    for (const listener of mockAppStateListeners) listener('background');
    for (const listener of mockAppStateListeners) listener('active');
  });
}
const available = (mandatory: boolean) => ({ ok: true, data: {
  updateAvailable: true, mandatory, latestVersionCode: 31, latestVersionName: '0.1.32',
  storeUrl: 'https://example.test/app', // No automatic APK download in these tests.
} });

it('mounts content immediately during a slow check, keeps it mounted on resume, and does not duplicate checks', async () => {
  let finish!: (result: any) => void;
  mockCheck.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  expectContentOnly();
  expect(mockStatus.isChecking).toBe(true);
  await act(async () => { jest.advanceTimersByTime(20_000); });
  await resume();
  expectContentOnly();
  expect(mockCheck).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ ok: true, data: { updateAvailable: false, mandatory: false } }); });
  expectContentOnly();
  expect(mockStatus.isChecking).toBe(false);
});

it('checks again on a later foreground return without remounting content or showing a loader', async () => {
  await render();
  await act(async () => { jest.advanceTimersByTime(16 * 60_000); });
  await resume();
  expect(mockCheck).toHaveBeenCalledTimes(2);
  expectContentOnly();
});

it('keeps an optional update in the banner and shows no fake progress when its dialog is opened', async () => {
  mockCheck.mockResolvedValue(available(false));
  await render();
  expectContentOnly();
  expect(mockStatus.phase).toBe('available');
  expect(mockStatus.progress).toBeNull();
  await act(async () => { screen.root.findByType('UpdateBanner' as any).props.onOpenApkUpdate(); });
  expect(screen.root.findAllByType('Modal' as any)).toHaveLength(1);
  expect(screen.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
  expect(JSON.stringify(screen.toJSON())).not.toMatch(/Загрузка|Готово|"width":"0%"/);
  await act(async () => { screen.root.findByType('Modal' as any).props.onRequestClose(); });
  expectContentOnly();
});

it('blocks mandatory-update dismissal without removing the underlying screen', async () => {
  mockCheck.mockResolvedValue(available(true));
  await render();
  expect(screen.root.findAllByType('Modal' as any)).toHaveLength(1);
  expect(mockStatus.mandatory).toBe(true);
  expect(JSON.stringify(screen.toJSON())).not.toMatch(/Закрыть|✕/);
  const modal = screen.root.findByType('Modal' as any);
  await act(async () => {
    modal.props.onRequestClose();
    modal.findAllByType('Pressable' as any)[0].props.onPress();
    await mockStatus.dismissUpdate();
  });
  expect(screen.root.findAllByType('Modal' as any)).toHaveLength(1);
  expect(mockMount).toHaveBeenCalledTimes(1);
  expect(mockUnmount).not.toHaveBeenCalled();
  // Server can revoke an accidental mandatory release; a fresh check releases the modal.
  mockCheck.mockResolvedValue({ ok: true, data: { updateAvailable: false, mandatory: false } });
  await act(async () => { await requestAppUpdateCheck(); });
  expectContentOnly();
});

it('does not obscure content when the update server is unavailable', async () => {
  mockCheck.mockResolvedValue({ ok: false, message: 'Нет сети' });
  await render();
  expectContentOnly();
  expect(mockStatus.isChecking).toBe(false);
});
