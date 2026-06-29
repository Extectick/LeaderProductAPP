import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { OtaUpdateStatusProvider, useOtaUpdateStatus } from '@/src/shared/ota/OtaUpdateStatusContext';
import AppStatusIndicator from '@/src/shared/ui/AppStatusIndicator';
import ServicesCatalogStatusAction from '@/src/features/services/ui/ServicesCatalogStatusAction';
import { requestAppUpdateCheck } from '@/utils/updateCheckRequests';
import {
  AppUpdateStatusProvider,
  initialAppBinaryUpdateStatus,
} from '@/src/shared/appUpdate/AppUpdateStatusContext';

const mockCheckForUpdateAsync = jest.fn();
const mockFetchUpdateAsync = jest.fn();
const mockReloadAsync = jest.fn();
const mockCheckBinaryUpdate = jest.fn();
const mockLogUpdateEvent = jest.fn(async (_payload?: unknown) => undefined);
const mockGetInstallId = jest.fn(async () => 'install-test');
let mockUpdatesEnabled = true;
let mockUpdatesState: Record<string, any>;
let mockServerStatus: Record<string, any>;
let mockAppStateListener: ((state: string) => void) | null = null;

jest.mock('expo-updates', () => ({
  __esModule: true,
  get isEnabled() {
    return mockUpdatesEnabled;
  },
  runtimeVersion: '0.1.17',
  useUpdates: () => mockUpdatesState,
  checkForUpdateAsync: (...args: unknown[]) => mockCheckForUpdateAsync(...args),
  fetchUpdateAsync: (...args: unknown[]) => mockFetchUpdateAsync(...args),
  reloadAsync: (...args: unknown[]) => mockReloadAsync(...args),
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '0.1.17',
  nativeBuildVersion: '16',
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    nativeAppVersion: '0.1.17',
    nativeBuildVersion: '16',
    expoConfig: {
      version: '0.1.17',
      android: { versionCode: 16 },
    },
  },
}));

jest.mock('@/utils/updateService', () => ({
  checkForUpdate: (payload: unknown) => mockCheckBinaryUpdate(payload),
  getInstallId: () => mockGetInstallId(),
  logUpdateEvent: (payload: unknown) => mockLogUpdateEvent(payload),
}));

jest.mock('react-native', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(
    name,
    props,
    typeof children === 'function' ? children({ pressed: false }) : children
  );
  return {
    ActivityIndicator: host('ActivityIndicator'),
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn((_event: string, listener: (state: string) => void) => {
        mockAppStateListener = listener;
        return { remove: jest.fn() };
      }),
    },
    Modal: ({ visible, children, ...props }: any) => (visible ? React.createElement('Modal', props, children) : null),
    Platform: { OS: 'android' },
    Pressable: host('Pressable'),
    StyleSheet: { create: (styles: any) => styles, absoluteFill: {} },
    Text: host('Text'),
    View: host('View'),
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children, ...props }: any) => React.createElement('Svg', props, children),
    Circle: (props: any) => React.createElement('Circle', props),
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: (props: any) => React.createElement('Ionicons', props),
  };
});

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: () => '#0F172A',
}));

jest.mock('@/utils/config', () => ({
  API_BASE_URL: 'http://api.test',
}));

jest.mock('@/utils/appVersion', () => ({
  getAppVersionInfo: () => ({
    fullVersionLabel: '0.1.17.7',
  }),
}));

jest.mock('@/src/shared/network/useServerStatus', () => ({
  useServerStatus: () => mockServerStatus,
}));

jest.mock('@/utils/updateCheckRequests', () => ({
  requestAppUpdateCheck: jest.fn(async () => ({ handled: true })),
}));

function resetMocks() {
  mockUpdatesEnabled = true;
  mockUpdatesState = {
    currentlyRunning: {
      updateId: 'current-update',
      isEmbeddedLaunch: false,
      isEmergencyLaunch: false,
      emergencyLaunchReason: null,
    },
    isChecking: false,
    isDownloading: false,
    isRestarting: false,
    isUpdatePending: false,
    downloadedUpdate: null,
    downloadProgress: null,
  };
  mockServerStatus = {
    isReachable: true,
    lastReason: null,
    lastChangedAt: Date.now(),
    lastReachableAt: Date.now(),
    lastUnavailableAt: null,
  };
  mockAppStateListener = null;
  mockCheckForUpdateAsync.mockReset();
  mockFetchUpdateAsync.mockReset();
  mockReloadAsync.mockReset();
  mockCheckBinaryUpdate.mockReset();
  mockCheckBinaryUpdate.mockResolvedValue({ ok: true, data: { updateAvailable: false, mandatory: false } });
  mockGetInstallId.mockClear();
  mockLogUpdateEvent.mockClear();
  jest.mocked(requestAppUpdateCheck).mockClear();
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  const value = node.props?.children;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return node.children.map((child) => (
    typeof child === 'string' ? child : textOf(child as TestRenderer.ReactTestInstance)
  )).join('');
}

function findPressables(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll((node) => String(node.type) === 'Pressable');
}

describe('OTA status indicator', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('downloads an OTA update and marks it ready without automatic reload', async () => {
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: true, isRollBackToEmbedded: false });
    mockFetchUpdateAsync.mockResolvedValue({ isNew: true, isRollBackToEmbedded: false });

    let status: ReturnType<typeof useOtaUpdateStatus>;
    function Harness() {
      status = useOtaUpdateStatus();
      return null;
    }

    await act(async () => {
      TestRenderer.create(
        React.createElement(OtaUpdateStatusProvider, { enabled: true }, React.createElement(Harness))
      );
    });

    await act(async () => {
      await status!.requestCheck('test');
    });

    expect(mockCheckForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mockFetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(status!.phase).toBe('ready');
    expect(status!.readyToReload).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockLogUpdateEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'OTA_READY' }));
  });

  it('skips OTA download when a newer APK runtime is available', async () => {
    mockCheckBinaryUpdate.mockResolvedValue({
      ok: true,
      data: {
        updateAvailable: true,
        mandatory: false,
        latestVersionCode: 17,
        latestVersionName: '0.1.18',
      },
    });
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: true, isRollBackToEmbedded: false });
    mockFetchUpdateAsync.mockResolvedValue({ isNew: true, isRollBackToEmbedded: false });

    let status: ReturnType<typeof useOtaUpdateStatus>;
    function Harness() {
      status = useOtaUpdateStatus();
      return React.createElement(AppStatusIndicator);
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(OtaUpdateStatusProvider, { enabled: true }, React.createElement(Harness))
      );
    });

    await act(async () => {
      await status!.requestCheck('test');
    });

    expect(mockCheckBinaryUpdate).toHaveBeenCalledTimes(1);
    expect(mockCheckForUpdateAsync).not.toHaveBeenCalled();
    expect(mockFetchUpdateAsync).not.toHaveBeenCalled();
    expect(status!.phase).toBe('idle');
    expect(status!.readyToReload).toBe(false);
    expect(findPressables(renderer!)[0].props.accessibilityLabel).toBe('Сервер доступен');
  });

  it('reloads only after the user confirms the ready update modal', async () => {
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: true, isRollBackToEmbedded: false });
    mockFetchUpdateAsync.mockResolvedValue({ isNew: true, isRollBackToEmbedded: false });

    let status: ReturnType<typeof useOtaUpdateStatus>;
    function Harness() {
      status = useOtaUpdateStatus();
      return React.createElement(AppStatusIndicator);
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(OtaUpdateStatusProvider, { enabled: true }, React.createElement(Harness))
      );
    });

    await act(async () => {
      await status!.requestCheck('test');
    });
    expect(mockReloadAsync).not.toHaveBeenCalled();

    const statusButton = findPressables(renderer!)[0];
    expect(statusButton.props.accessibilityLabel).toBe('Обновление готово');

    await act(async () => {
      statusButton.props.onPress();
    });

    const updateButtons = renderer!.root
      .findAll((node) => String(node.type) === 'Pressable')
      .filter((node) => textOf(node).includes('Обновить'));
    const updateButton = updateButtons[updateButtons.length - 1];
    expect(updateButton).toBeTruthy();

    await act(async () => {
      updateButton!.props.onPress();
    });

    expect(mockReloadAsync).toHaveBeenCalledTimes(1);
    expect(mockLogUpdateEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'OTA_RELOAD' }));
  });

  it('keeps the ready state visible when the user chooses later', async () => {
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: true, isRollBackToEmbedded: false });
    mockFetchUpdateAsync.mockResolvedValue({ isNew: true, isRollBackToEmbedded: false });

    let status: ReturnType<typeof useOtaUpdateStatus>;
    function Harness() {
      status = useOtaUpdateStatus();
      return React.createElement(AppStatusIndicator);
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(OtaUpdateStatusProvider, { enabled: true }, React.createElement(Harness))
      );
    });

    await act(async () => {
      await status!.requestCheck('test');
    });

    await act(async () => {
      findPressables(renderer!)[0].props.onPress();
    });

    const laterButtons = renderer!.root
      .findAll((node) => String(node.type) === 'Pressable')
      .filter((node) => textOf(node).includes('Позже'));
    const laterButton = laterButtons[laterButtons.length - 1];

    await act(async () => {
      laterButton!.props.onPress();
    });

    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(status!.phase).toBe('ready');
    expect(findPressables(renderer!)[0].props.accessibilityLabel).toBe('Обновление готово');
  });

  it('prioritizes OTA ready state over offline server state', async () => {
    mockServerStatus.isReachable = false;
    mockServerStatus.lastReason = 'network';
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: true, isRollBackToEmbedded: false });
    mockFetchUpdateAsync.mockResolvedValue({ isNew: true, isRollBackToEmbedded: false });

    let status: ReturnType<typeof useOtaUpdateStatus>;
    function Harness() {
      status = useOtaUpdateStatus();
      return React.createElement(AppStatusIndicator);
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(OtaUpdateStatusProvider, { enabled: true }, React.createElement(Harness))
      );
    });

    await act(async () => {
      await status!.requestCheck('test');
    });

    const statusButton = findPressables(renderer!)[0];
    expect(statusButton.props.accessibilityLabel).toBe('Обновление готово');
  });

  it('does not ask to restart when the downloaded update is already running', async () => {
    mockUpdatesState.downloadedUpdate = {
      updateId: 'already-running-update',
      manifest: { extra: { displayVersion: '0.1.17.8' } },
    };
    mockUpdatesState.currentlyRunning.updateId = 'already-running-update';
    mockUpdatesState.isUpdatePending = false;

    let status: ReturnType<typeof useOtaUpdateStatus>;
    function Harness() {
      status = useOtaUpdateStatus();
      return React.createElement(AppStatusIndicator);
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(OtaUpdateStatusProvider, { enabled: true }, React.createElement(Harness))
      );
    });

    expect(status!.phase).toBe('idle');
    expect(status!.readyToReload).toBe(false);
    expect(findPressables(renderer!)[0].props.accessibilityLabel).toBe('Сервер доступен');
  });

  it('keeps catalog idle press behavior for APK check and services refresh', async () => {
    const loadServices = jest.fn(async () => undefined);

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(OtaUpdateStatusProvider, { enabled: true }, React.createElement(ServicesCatalogStatusAction, { loadServices }))
      );
    });

    const statusButton = findPressables(renderer!)[0];
    await act(async () => {
      await statusButton.props.onPress();
    });

    expect(requestAppUpdateCheck).toHaveBeenCalledTimes(1);
    expect(loadServices).toHaveBeenCalledWith(true);
  });

  it('shows APK download progress in the status modal', async () => {
    const apkStatus = {
      ...initialAppBinaryUpdateStatus,
      phase: 'downloading' as const,
      progress: 0.42,
      updateInfo: {
        updateAvailable: true,
        mandatory: false,
        latestVersionCode: 17,
        latestVersionName: '0.1.18',
        fileSize: 42 * 1024 * 1024,
        downloadUrl: 'https://updates.test/app.apk',
      },
      latestVersionCode: 17,
      latestVersionName: '0.1.18',
      fileSize: 42 * 1024 * 1024,
      isDownloading: true,
    };

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          OtaUpdateStatusProvider,
          { enabled: true },
          React.createElement(
            AppUpdateStatusProvider,
            { value: apkStatus },
            React.createElement(AppStatusIndicator)
          )
        )
      );
    });

    expect(findPressables(renderer!)[0].props.accessibilityLabel).toBe('Скачиваем APK');

    await act(async () => {
      findPressables(renderer!)[0].props.onPress();
    });

    const allText = textOf(renderer!.root);
    expect(allText).toContain('42%');
    expect(allText).toContain('0.1.18');
  });

  it('installs a ready APK only after the user presses install', async () => {
    const installUpdate = jest.fn(async () => undefined);
    const apkStatus = {
      ...initialAppBinaryUpdateStatus,
      phase: 'ready' as const,
      progress: 1,
      updateInfo: {
        updateAvailable: true,
        mandatory: false,
        latestVersionCode: 17,
        latestVersionName: '0.1.18',
        downloadUrl: 'https://updates.test/app.apk',
      },
      latestVersionCode: 17,
      latestVersionName: '0.1.18',
      readyToInstall: true,
      installUpdate,
    };

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          OtaUpdateStatusProvider,
          { enabled: true },
          React.createElement(
            AppUpdateStatusProvider,
            { value: apkStatus },
            React.createElement(AppStatusIndicator)
          )
        )
      );
    });

    await act(async () => {
      findPressables(renderer!)[0].props.onPress();
    });

    expect(installUpdate).not.toHaveBeenCalled();

    const installButton = renderer!.root
      .findAll((node) => String(node.type) === 'Pressable')
      .filter((node) => textOf(node).includes('Установить'))
      .pop();

    await act(async () => {
      installButton!.props.onPress();
    });

    expect(installUpdate).toHaveBeenCalledTimes(1);
  });

  it('can trigger an OTA check after resume from background', async () => {
    jest.useFakeTimers();
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: false, isRollBackToEmbedded: false });

    await act(async () => {
      TestRenderer.create(
        React.createElement(OtaUpdateStatusProvider, { enabled: true }, React.createElement(React.Fragment))
      );
    });

    await act(async () => {
      mockAppStateListener?.('background');
      await jest.advanceTimersByTimeAsync(61_000);
      mockAppStateListener?.('active');
    });

    expect(mockCheckForUpdateAsync).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('runs a non-blocking OTA check after the interface is active', async () => {
    jest.useFakeTimers();
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: true, isRollBackToEmbedded: false });
    mockFetchUpdateAsync.mockResolvedValue({ isNew: true, isRollBackToEmbedded: false });

    let status: ReturnType<typeof useOtaUpdateStatus>;
    function Harness() {
      status = useOtaUpdateStatus();
      return null;
    }

    await act(async () => {
      TestRenderer.create(
        React.createElement(OtaUpdateStatusProvider, { enabled: true }, React.createElement(Harness))
      );
    });

    expect(mockCheckForUpdateAsync).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });

    expect(mockCheckForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mockFetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(status!.phase).toBe('ready');
    jest.useRealTimers();
  });
});
