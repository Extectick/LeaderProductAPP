import React from 'react';
import type { UpdateCheckResult } from '@/utils/updateService';

export type AppBinaryUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'opening'
  | 'error'
  | 'disabled';

export type AppBinaryUpdateStatus = {
  phase: AppBinaryUpdatePhase;
  progress: number | null;
  updateInfo: UpdateCheckResult | null;
  latestVersionName: string | null;
  latestVersionCode: number | null;
  fileSize: number | null;
  mandatory: boolean;
  errorMessage: string | null;
  readyToInstall: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  isBusy: boolean;
  lastCheckedAt: number | null;
};

export type AppBinaryUpdateStatusContextValue = AppBinaryUpdateStatus & {
  requestCheck: (source?: string) => Promise<boolean>;
  startDownload: () => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissUpdate: () => Promise<void>;
};

const noopBool = async () => false;
const noopVoid = async () => undefined;

export const initialAppBinaryUpdateStatus: AppBinaryUpdateStatusContextValue = {
  phase: 'idle',
  progress: null,
  updateInfo: null,
  latestVersionName: null,
  latestVersionCode: null,
  fileSize: null,
  mandatory: false,
  errorMessage: null,
  readyToInstall: false,
  isChecking: false,
  isDownloading: false,
  isBusy: false,
  lastCheckedAt: null,
  requestCheck: noopBool,
  startDownload: noopVoid,
  installUpdate: noopVoid,
  dismissUpdate: noopVoid,
};

const AppUpdateStatusContext = React.createContext<AppBinaryUpdateStatusContextValue>(
  initialAppBinaryUpdateStatus
);

export function AppUpdateStatusProvider({
  children,
  value,
}: {
  children?: React.ReactNode;
  value: AppBinaryUpdateStatusContextValue;
}) {
  return (
    <AppUpdateStatusContext.Provider value={value}>
      {children}
    </AppUpdateStatusContext.Provider>
  );
}

export function useAppUpdateStatus() {
  return React.useContext(AppUpdateStatusContext);
}
