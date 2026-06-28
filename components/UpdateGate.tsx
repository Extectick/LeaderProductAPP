import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  checkForUpdate,
  getInstallId,
  logUpdateEvent,
  UpdateCheckResult,
} from '@/utils/updateService';
import {
  AppUpdateCheckRequestResult,
  subscribeAppUpdateCheckRequests,
} from '@/utils/updateCheckRequests';
import {
  AndroidApkDownloadState,
  enqueueAndroidApkDownload,
  getAndroidApkDownloadStatus,
  isAndroidApkDownloadSupported,
  openAndroidDownloadedApk,
  removeAndroidApkDownload,
} from '@/utils/androidApkDownload';
import {
  AppBinaryUpdatePhase,
  AppBinaryUpdateStatusContextValue,
  AppUpdateStatusProvider,
} from '@/src/shared/appUpdate/AppUpdateStatusContext';

const STORAGE_KEYS = {
  dismissedVersionCode: 'update:dismissedVersionCode',
  etag: 'update:etag',
  androidDownload: 'update:androidDownload',
};

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const CHECK_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const CHECK_FAILURE_SKIP_AFTER = 2;
const UPDATE_CHANNEL = process.env.EXPO_PUBLIC_UPDATE_CHANNEL || 'prod';
const ANDROID_APK_INSTALL_ACTION = 'android.intent.action.VIEW';
const ANDROID_APK_MIME = 'application/vnd.android.package-archive';
const ANDROID_INSTALL_INTENT_FLAGS = 1 | 268435456;
const APK_DOWNLOAD_STALE_MS = 20 * 60 * 1000;

type Props = {
  children: React.ReactNode;
  onStartupDone?: () => void;
  showCheckingOverlay?: boolean;
};

function formatBytes(bytes?: number | null) {
  if (!bytes || !Number.isFinite(bytes)) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} МБ`;
  const kb = bytes / 1024;
  return `${Math.max(1, Math.round(kb))} КБ`;
}

const STARTUP_MAX_WAIT_MS = 12000;

export default function UpdateGate({ children, onStartupDone, showCheckingOverlay = false }: Props) {
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [mandatoryVisible, setMandatoryVisible] = useState(false);
  const [optionalVisible, setOptionalVisible] = useState(false);
  const [checkingVisible, setCheckingVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [androidDownloadId, setAndroidDownloadId] = useState<string | null>(null);
  const [downloadedApkUri, setDownloadedApkUri] = useState<string | null>(null);
  const [stage, setStage] = useState<
    'idle' | 'available' | 'downloading' | 'verifying' | 'opening' | 'done' | 'error'
  >('idle');
  const checkingRef = useRef(false);
  const lastCheckAtRef = useRef(0);
  const promptLoggedForRef = useRef<number | null>(null);
  const downloadDoneLoggedForRef = useRef<number | null>(null);
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);
  const startupDoneRef = useRef(false);
  const startupCheckStartedRef = useRef(false);
  const autoDownloadVersionRef = useRef<number | null>(null);
  const downloadStartedAtRef = useRef<number | null>(null);

  const getAndroidDownloadKey = useCallback(() => {
    return `${STORAGE_KEYS.androidDownload}:${UPDATE_CHANNEL}`;
  }, []);

  const readAndroidDownloadState = useCallback(async (): Promise<AndroidApkDownloadState | null> => {
    if (Platform.OS !== 'android') return null;
    const raw = await AsyncStorage.getItem(getAndroidDownloadKey());
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AndroidApkDownloadState;
      if (!parsed?.downloadId || !parsed?.fileName) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [getAndroidDownloadKey]);

  const clearAndroidDownloadState = useCallback(async () => {
    setAndroidDownloadId(null);
    setDownloadedApkUri(null);
    await AsyncStorage.removeItem(getAndroidDownloadKey());
  }, [getAndroidDownloadKey]);

  const saveAndroidDownloadState = useCallback(
    async (next: AndroidApkDownloadState) => {
      setAndroidDownloadId(next.downloadId);
      await AsyncStorage.setItem(getAndroidDownloadKey(), JSON.stringify(next));
    },
    [getAndroidDownloadKey]
  );

  const completeStartup = useCallback(() => {
    if (startupDoneRef.current) return;
    startupDoneRef.current = true;
    onStartupDone?.();
  }, [onStartupDone]);

  const versionName =
    Application.nativeApplicationVersion ??
    Constants.nativeAppVersion ??
    Constants.expoConfig?.version ??
    '0.0.0';
  const nativeBuildVersion = Number(
    Application.nativeBuildVersion ?? Constants.nativeBuildVersion ?? 0
  );
  const androidVersionCode = Number(Constants.expoConfig?.android?.versionCode ?? 0);
  const iosVersionCode = Number(Constants.expoConfig?.ios?.buildNumber ?? 0);
  const androidPackageName = Constants.expoConfig?.android?.package ?? 'com.leaderproduct.app';
  const configVersionCode = Platform.OS === 'ios' ? iosVersionCode : androidVersionCode;
  const versionCode = nativeBuildVersion || configVersionCode;

  const shouldCheck = Platform.OS === 'android' || Platform.OS === 'ios';
  const modalVisible = mandatoryVisible || optionalVisible;

  const openDownloadedApk = useCallback(
    async (apkUri: string, fallbackUrl?: string | null) => {
      const contentUri = await FileSystem.getContentUriAsync(apkUri);

      try {
        await IntentLauncher.startActivityAsync(ANDROID_APK_INSTALL_ACTION, {
          data: contentUri,
          type: ANDROID_APK_MIME,
          flags: ANDROID_INSTALL_INTENT_FLAGS,
        });
        return;
      } catch (intentError) {
        console.warn('[update] package installer intent failed', intentError);
      }

      try {
        await Linking.openURL(contentUri);
        return;
      } catch (linkingError) {
        console.warn('[update] content uri open failed', linkingError);
      }

      if (fallbackUrl) {
        try {
          await Linking.openURL(fallbackUrl);
          return;
        } catch (fallbackError) {
          console.warn('[update] remote apk open failed', fallbackError);
        }
      }

      try {
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
          data: `package:${androidPackageName}`,
        });
      } catch (settingsError) {
        console.warn('[update] open install settings failed', settingsError);
      }

      throw new Error('Разрешите установку из этого приложения и повторите попытку.');
    },
    [androidPackageName]
  );

  const openManagedDownloadedApk = useCallback(
    async (downloadId: string) => {
      try {
        await openAndroidDownloadedApk(downloadId);
        return;
      } catch (nativeError) {
        console.warn('[update] native installer open failed', nativeError);
      }

      try {
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
          data: `package:${androidPackageName}`,
        });
      } catch (settingsError) {
        console.warn('[update] open install settings failed', settingsError);
      }

      throw new Error('Разрешите установку из этого приложения и повторите попытку.');
    },
    [androidPackageName]
  );

  const verifyManagedDownloadedApk = useCallback(
    async (saved: AndroidApkDownloadState, localUri?: string | null) => {
      if (!saved.checksumMd5) return true;
      if (!localUri) return false;

      const info = await FileSystem.getInfoAsync(localUri, { md5: true });
      const actualMd5 = info.exists ? info.md5?.toLowerCase() : null;
      const expectedMd5 = saved.checksumMd5.toLowerCase();
      if (actualMd5 && actualMd5 === expectedMd5) return true;

      try {
        await removeAndroidApkDownload(saved.downloadId);
      } catch {}
      await clearAndroidDownloadState();

      const deviceId = await getInstallId();
      await logUpdateEvent({
        eventType: 'VERIFY_FAILED',
        platform: Platform.OS as 'android' | 'ios',
        versionCode,
        versionName,
        deviceId,
        updateId: saved.updateId ?? updateInfo?.latestId,
        channel: UPDATE_CHANNEL,
      });

      setErrorMessage('Контрольная сумма файла не совпадает. Повторите загрузку.');
      setStage('error');
      setProgress(0);
      return false;
    },
    [clearAndroidDownloadState, updateInfo?.latestId, versionCode, versionName]
  );

  const logDownloadDoneOnce = useCallback(async () => {
    const updateId = updateInfo?.latestId ?? 0;
    if (downloadDoneLoggedForRef.current === updateId) return;
    downloadDoneLoggedForRef.current = updateId;
    const deviceId = await getInstallId();
    await logUpdateEvent({
      eventType: 'DOWNLOAD_DONE',
      platform: Platform.OS as 'android' | 'ios',
      versionCode,
      versionName,
      deviceId,
      updateId: updateInfo?.latestId,
      channel: UPDATE_CHANNEL,
    });
  }, [updateInfo?.latestId, versionCode, versionName]);

  const buildAndroidApkFileName = useCallback(() => {
    const nextVersion = updateInfo?.latestVersionCode || Date.now();
    return `leader-product-update-${nextVersion}.apk`;
  }, [updateInfo?.latestVersionCode]);

  const getFallbackApkFileUri = useCallback(() => {
    const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!baseDir || !updateInfo?.latestVersionCode) return null;
    return `${baseDir}updates/update_${updateInfo.latestVersionCode}.apk`;
  }, [updateInfo?.latestVersionCode]);

  const getEtagKey = useCallback(() => {
    return `${STORAGE_KEYS.etag}:${Platform.OS}:${UPDATE_CHANNEL}`;
  }, []);

  const getDismissKey = useCallback(() => {
    return `${STORAGE_KEYS.dismissedVersionCode}:${Platform.OS}:${UPDATE_CHANNEL}`;
  }, []);

  const getFailureKey = useCallback(() => {
    return `update:checkFailures:${Platform.OS}:${UPDATE_CHANNEL}`;
  }, []);

  const shouldSkipAfterFailures = useCallback(async () => {
    const raw = await AsyncStorage.getItem(getFailureKey());
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as { count?: number; lastFailedAt?: number };
      const count = Number(parsed.count || 0);
      const lastFailedAt = Number(parsed.lastFailedAt || 0);
      if (count < CHECK_FAILURE_SKIP_AFTER || !lastFailedAt) return false;
      return Date.now() - lastFailedAt < CHECK_FAILURE_COOLDOWN_MS;
    } catch {
      return false;
    }
  }, [getFailureKey]);

  const recordCheckFailure = useCallback(async () => {
    const raw = await AsyncStorage.getItem(getFailureKey());
    let count = 0;
    if (raw) {
      try {
        count = Number((JSON.parse(raw) as { count?: number }).count || 0);
      } catch {
        count = 0;
      }
    }
    await AsyncStorage.setItem(
      getFailureKey(),
      JSON.stringify({ count: count + 1, lastFailedAt: Date.now() })
    );
  }, [getFailureKey]);

  const clearCheckFailures = useCallback(async () => {
    await AsyncStorage.removeItem(getFailureKey());
  }, [getFailureKey]);

  const runCheck = useCallback(
    async (source: string): Promise<AppUpdateCheckRequestResult> => {
      if (!shouldCheck) {
        return { handled: true, ok: false, updateAvailable: false, message: 'Проверка обновлений недоступна на этой платформе.' };
      }
      if (checkingRef.current) {
        return { handled: true, ok: false, updateAvailable: false, message: 'Проверка обновлений уже выполняется.' };
      }
      if (!versionCode) {
        return { handled: true, ok: false, updateAvailable: false, message: 'Не удалось определить текущую версию приложения.' };
      }

      checkingRef.current = true;
      try {
        const isManual = source === 'manual';
        if (!isManual && await shouldSkipAfterFailures()) {
          lastCheckAtRef.current = Date.now();
          return { handled: true, ok: false, updateAvailable: false, message: 'Проверка временно пропущена после ошибок соединения.' };
        }

        if (source === 'startup') {
          setCheckingVisible(true);
        }

        const deviceId = await getInstallId();
        const etagKey = getEtagKey();
        const storedEtag = await AsyncStorage.getItem(etagKey);

        const result = await checkForUpdate({
          platform: Platform.OS as 'android' | 'ios',
          versionCode,
          versionName,
          deviceId,
          channel: UPDATE_CHANNEL,
          ifNoneMatch: updateInfo ? storedEtag : null,
        });

        if (result.etag) {
          await AsyncStorage.setItem(etagKey, result.etag);
        }

        if (result.notModified) {
          await clearCheckFailures();
          lastCheckAtRef.current = Date.now();
          return { handled: true, ok: true, updateAvailable: Boolean(updateInfo?.updateAvailable) };
        }

        if (!result.ok || !result.data) {
          if (!isManual) {
            await recordCheckFailure();
          }
          lastCheckAtRef.current = Date.now();
          return {
            handled: true,
            ok: false,
            updateAvailable: false,
            message: result.message || 'Не удалось проверить обновления.',
          };
        }

        await clearCheckFailures();

        const data = result.data;
        const updateAvailable = Boolean(data.updateAvailable);

        setUpdateInfo(data);
        setMandatoryVisible(false);
        setOptionalVisible(false);
        setErrorMessage(null);
        setStage((current) => {
          if (!updateAvailable) return 'idle';
          if (current === 'downloading' || current === 'verifying' || current === 'opening' || current === 'done') {
            return current;
          }
          return 'available';
        });
        if (!updateAvailable) {
          autoDownloadVersionRef.current = null;
          setProgress(0);
          setAndroidDownloadId(null);
          setDownloadedApkUri(null);
        }
        lastCheckAtRef.current = Date.now();

        if (updateAvailable) {
          void logUpdateEvent({
            eventType: 'CHECK',
            platform: Platform.OS as 'android' | 'ios',
            versionCode,
            versionName,
            deviceId,
            updateId: data.latestId,
            channel: UPDATE_CHANNEL,
          });
        }
        return { handled: true, ok: true, updateAvailable };
      } catch (e) {
        console.warn('[update] check failed', source, e);
        return {
          handled: true,
          ok: false,
          updateAvailable: false,
          message: e instanceof Error ? e.message : 'Не удалось проверить обновления.',
        };
      } finally {
        checkingRef.current = false;
        setCheckingVisible(false);
        if (source === 'startup') {
          completeStartup();
        }
      }
    },
    [
      clearCheckFailures,
      completeStartup,
      getDismissKey,
      getEtagKey,
      recordCheckFailure,
      shouldCheck,
      shouldSkipAfterFailures,
      updateInfo,
      versionCode,
      versionName,
    ]
  );

  useEffect(() => {
    if (startupCheckStartedRef.current) return;
    startupCheckStartedRef.current = true;
    if (!shouldCheck || !versionCode) {
      completeStartup();
      return;
    }
    void runCheck('startup');
  }, [completeStartup, runCheck, shouldCheck, versionCode]);

  useEffect(() => {
    return subscribeAppUpdateCheckRequests(() => runCheck('manual'));
  }, [runCheck]);

  useEffect(() => {
    const t = setTimeout(() => {
      completeStartup();
    }, STARTUP_MAX_WAIT_MS);
    return () => clearTimeout(t);
  }, [completeStartup]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastCheckAtRef.current < CHECK_INTERVAL_MS) return;
      void runCheck('appstate');
    });
    return () => sub.remove();
  }, [runCheck]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!isAndroidApkDownloadSupported()) return;
    if (!updateInfo?.updateAvailable) return;
    if (!updateInfo?.downloadUrl) return;

    let cancelled = false;

    const syncManagedDownload = async () => {
      const saved = await readAndroidDownloadState();
      if (!saved) return;

      const latestVersionCode = updateInfo.latestVersionCode ?? 0;
      if (latestVersionCode > 0 && saved.versionCode !== latestVersionCode) {
        await clearAndroidDownloadState();
        return;
      }

      const status = await getAndroidApkDownloadStatus(saved.downloadId);
      if (cancelled) return;

      setAndroidDownloadId(saved.downloadId);

      if (status.status === 'SUCCESSFUL') {
        const verified = await verifyManagedDownloadedApk(saved, status.localUri);
        if (!verified) return;
        setStage((current) => (current === 'error' ? current : 'done'));
        setProgress(100);
        await logDownloadDoneOnce();
        return;
      }

      if (status.status === 'RUNNING' || status.status === 'PENDING' || status.status === 'PAUSED') {
        const totalBytes = status.totalBytes ?? 0;
        const downloadedBytes = status.downloadedBytes ?? 0;
        const percent =
          totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        setStage((current) => (current === 'error' ? current : 'downloading'));
        setProgress(percent);
        return;
      }

      if (status.status === 'FAILED' || status.status === 'NOT_FOUND') {
        await clearAndroidDownloadState();
        if (!busy) {
          setStage('idle');
          setProgress(0);
        }
      }
    };

    void syncManagedDownload();

    return () => {
      cancelled = true;
    };
  }, [
    busy,
    clearAndroidDownloadState,
    logDownloadDoneOnce,
    readAndroidDownloadState,
    updateInfo?.downloadUrl,
    updateInfo?.updateAvailable,
    updateInfo?.latestVersionCode,
    verifyManagedDownloadedApk,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!isAndroidApkDownloadSupported()) return;
    if (!androidDownloadId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollManagedDownload = async () => {
      const status = await getAndroidApkDownloadStatus(androidDownloadId);
      if (cancelled) return;

      if (status.status === 'RUNNING' || status.status === 'PENDING' || status.status === 'PAUSED') {
        const totalBytes = status.totalBytes ?? 0;
        const downloadedBytes = status.downloadedBytes ?? 0;
        const percent =
          totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        setStage((current) => (current === 'error' ? current : 'downloading'));
        setProgress(percent);
        timer = setTimeout(() => {
          void pollManagedDownload();
        }, 1500);
        return;
      }

      if (status.status === 'SUCCESSFUL') {
        const saved = await readAndroidDownloadState();
        if (saved) {
          const verified = await verifyManagedDownloadedApk(saved, status.localUri);
          if (!verified) return;
        }
        setProgress(100);
        setStage((current) => (current === 'error' ? current : 'done'));
        await logDownloadDoneOnce();
        return;
      }

      if (status.status === 'FAILED' || status.status === 'NOT_FOUND') {
        await clearAndroidDownloadState();
        if (!cancelled && !busy) {
          setStage('idle');
          setProgress(0);
        }
      }
    };

    void pollManagedDownload();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [androidDownloadId, busy, clearAndroidDownloadState, logDownloadDoneOnce, readAndroidDownloadState, verifyManagedDownloadedApk]);

  useEffect(() => {
    if (stage !== 'downloading') return;
    const startedAt = downloadStartedAtRef.current;
    if (!startedAt) return;
    const timer = setTimeout(() => {
      if (Date.now() - startedAt < APK_DOWNLOAD_STALE_MS) return;
      setStage('error');
      setErrorMessage('Загрузка обновления заняла слишком много времени. Повторите позже.');
      setProgress(0);
    }, APK_DOWNLOAD_STALE_MS + 1000);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (!updateInfo?.updateAvailable) return;
    if (!mandatoryVisible && !optionalVisible) return;
    const latestId = updateInfo.latestId ?? 0;
    if (promptLoggedForRef.current === latestId) return;
    promptLoggedForRef.current = latestId;

    void (async () => {
      const deviceId = await getInstallId();
      await logUpdateEvent({
        eventType: 'PROMPT_SHOWN',
        platform: Platform.OS as 'android' | 'ios',
        versionCode,
        versionName,
        deviceId,
        updateId: updateInfo.latestId,
        channel: UPDATE_CHANNEL,
      });
    })();
  }, [mandatoryVisible, optionalVisible, updateInfo, versionCode, versionName]);

  const startApkDownload = useCallback(async (openWhenReady = false) => {
    setErrorMessage(null);
    if (!updateInfo) return;

    const url = updateInfo.storeUrl || updateInfo.downloadUrl;
    if (!url) {
      setErrorMessage('Ссылка на обновление недоступна.');
      return;
    }

    setBusy(true);
    try {
      const deviceId = await getInstallId();

      if (Platform.OS === 'android' && updateInfo.downloadUrl && isAndroidApkDownloadSupported()) {
        const latestVersion = updateInfo.latestVersionCode || Date.now();
        const saved = await readAndroidDownloadState();

        if (saved) {
          if (saved.versionCode !== latestVersion) {
            try {
              await removeAndroidApkDownload(saved.downloadId);
            } catch {}
            await clearAndroidDownloadState();
          } else {
            const status = await getAndroidApkDownloadStatus(saved.downloadId);
            setAndroidDownloadId(saved.downloadId);

            if (status.status === 'SUCCESSFUL') {
              const verified = await verifyManagedDownloadedApk(saved, status.localUri);
              if (!verified) return;
              setProgress(100);
              setStage(openWhenReady ? 'opening' : 'done');
              if (openWhenReady) {
                await openManagedDownloadedApk(saved.downloadId);
              }
              setStage('done');
              if (openWhenReady) {
                await logUpdateEvent({
                  eventType: 'INSTALL_CLICK',
                  platform: Platform.OS as 'android' | 'ios',
                  versionCode,
                  versionName,
                  deviceId,
                  updateId: updateInfo.latestId,
                  channel: UPDATE_CHANNEL,
                });
              } else {
                await logDownloadDoneOnce();
              }
              return;
            }

            if (
              status.status === 'RUNNING' ||
              status.status === 'PENDING' ||
              status.status === 'PAUSED'
            ) {
              const totalBytes = status.totalBytes ?? 0;
              const downloadedBytes = status.downloadedBytes ?? 0;
              const percent =
                totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
              setProgress(percent);
              setStage('downloading');
              return;
            }

            if (status.status === 'FAILED' || status.status === 'NOT_FOUND') {
              try {
                await removeAndroidApkDownload(saved.downloadId);
              } catch {}
              await clearAndroidDownloadState();
            }
          }
        }

        const enqueueResult = await enqueueAndroidApkDownload(
          updateInfo.downloadUrl,
          buildAndroidApkFileName(),
          `Обновление v${updateInfo.latestVersionName || latestVersion}`,
          'Загрузка обновления приложения'
        );

        await saveAndroidDownloadState({
          downloadId: enqueueResult.downloadId,
          versionCode: latestVersion,
          fileName: enqueueResult.fileName,
          checksumMd5: updateInfo.checksumMd5 ?? null,
          updateId: updateInfo.latestId ?? null,
        });

        setStage('downloading');
        setProgress(0);
        downloadStartedAtRef.current = Date.now();
        await logUpdateEvent({
          eventType: 'DOWNLOAD_START',
          platform: Platform.OS as 'android' | 'ios',
          versionCode,
          versionName,
          deviceId,
          updateId: updateInfo.latestId,
          channel: UPDATE_CHANNEL,
        });
        return;
      }

      if (Platform.OS === 'android' && updateInfo.downloadUrl && updateInfo.checksumMd5) {
        const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
        if (!baseDir) {
          setErrorMessage('Не удалось подготовить файл для обновления.');
          setStage('error');
          return;
        }
        const folder = `${baseDir}updates/`;
        const versionTag = updateInfo.latestVersionCode || Date.now();
        const fileUri = getFallbackApkFileUri() || `${folder}update_${versionTag}.apk`;

        try {
          await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
        } catch {}

        const cached = await FileSystem.getInfoAsync(fileUri, { md5: true });
        if (cached.exists && cached.md5 && cached.md5.toLowerCase() === updateInfo.checksumMd5.toLowerCase()) {
          setProgress(100);
          setDownloadedApkUri(fileUri);
          setStage(openWhenReady ? 'opening' : 'done');
          if (openWhenReady) {
            await openDownloadedApk(fileUri, updateInfo.downloadUrl);
          }
          setProgress(100);
          setStage('done');
          if (openWhenReady) {
            await logUpdateEvent({
              eventType: 'INSTALL_CLICK',
              platform: Platform.OS as 'android' | 'ios',
              versionCode,
              versionName,
              deviceId,
              updateId: updateInfo.latestId,
              channel: UPDATE_CHANNEL,
            });
          } else {
            await logDownloadDoneOnce();
          }
          return;
        }

        if (cached.exists) {
          try {
            await FileSystem.deleteAsync(fileUri, { idempotent: true });
          } catch {}
        }

        setStage('downloading');
        setProgress(0);
        downloadStartedAtRef.current = Date.now();
        await logUpdateEvent({
          eventType: 'DOWNLOAD_START',
          platform: Platform.OS as 'android' | 'ios',
          versionCode,
          versionName,
          deviceId,
          updateId: updateInfo.latestId,
          channel: UPDATE_CHANNEL,
        });
        downloadRef.current = FileSystem.createDownloadResumable(
          updateInfo.downloadUrl,
          fileUri,
          { md5: true },
          (evt) => {
            if (!evt.totalBytesExpectedToWrite) return;
            const percent = Math.min(
              100,
              Math.round((evt.totalBytesWritten / evt.totalBytesExpectedToWrite) * 100)
            );
            setProgress(percent);
          }
        );
        const result = await downloadRef.current.downloadAsync();
        downloadRef.current = null;
        if (!result?.uri) {
          setErrorMessage('Не удалось загрузить файл обновления.');
          setStage('error');
          return;
        }
        setStage('verifying');
        if (result.md5 && updateInfo.checksumMd5 && result.md5.toLowerCase() !== updateInfo.checksumMd5.toLowerCase()) {
          setErrorMessage('Контрольная сумма файла не совпадает. Повторите загрузку.');
          setStage('error');
          await logUpdateEvent({
            eventType: 'VERIFY_FAILED',
            platform: Platform.OS as 'android' | 'ios',
            versionCode,
            versionName,
            deviceId,
            updateId: updateInfo.latestId,
            channel: UPDATE_CHANNEL,
          });
          return;
        }
        setDownloadedApkUri(result.uri);
        setProgress(100);
        setStage(openWhenReady ? 'opening' : 'done');
        if (openWhenReady) {
          await openDownloadedApk(result.uri, updateInfo.downloadUrl);
        }
        setStage('done');

        if (openWhenReady) {
          await logUpdateEvent({
            eventType: 'INSTALL_CLICK',
            platform: Platform.OS as 'android' | 'ios',
            versionCode,
            versionName,
            deviceId,
            updateId: updateInfo.latestId,
            channel: UPDATE_CHANNEL,
          });
        } else {
          await logDownloadDoneOnce();
        }
        return;
      }

      if (openWhenReady) {
        setStage('opening');
        await Linking.openURL(url);
        setProgress(100);
        setStage('done');
        await logUpdateEvent({
          eventType: 'INSTALL_CLICK',
          platform: Platform.OS as 'android' | 'ios',
          versionCode,
          versionName,
          deviceId,
          updateId: updateInfo.latestId,
          channel: UPDATE_CHANNEL,
        });
      } else {
        setStage('available');
      }
    } catch (e) {
      console.warn('[update] openURL failed', e);
      const msg = (e as any)?.message || 'Не удалось выполнить обновление.';
      setErrorMessage(msg);
      setStage('error');
    } finally {
      setBusy(false);
    }
  }, [
    buildAndroidApkFileName,
    clearAndroidDownloadState,
    getFallbackApkFileUri,
    logDownloadDoneOnce,
    openDownloadedApk,
    openManagedDownloadedApk,
    readAndroidDownloadState,
    saveAndroidDownloadState,
    updateInfo,
    verifyManagedDownloadedApk,
    versionCode,
    versionName,
  ]);

  const installUpdate = useCallback(async () => {
    if (!updateInfo) return;

    if (Platform.OS === 'android' && updateInfo.downloadUrl) {
      if (isAndroidApkDownloadSupported() && androidDownloadId) {
        try {
          const status = await getAndroidApkDownloadStatus(androidDownloadId);
          if (status.status === 'SUCCESSFUL') {
            const saved = await readAndroidDownloadState();
            if (saved) {
              const verified = await verifyManagedDownloadedApk(saved, status.localUri);
              if (!verified) return;
            }
            setBusy(true);
            setStage('opening');
            const deviceId = await getInstallId();
            await openManagedDownloadedApk(androidDownloadId);
            setStage('done');
            await logUpdateEvent({
              eventType: 'INSTALL_CLICK',
              platform: Platform.OS as 'android' | 'ios',
              versionCode,
              versionName,
              deviceId,
              updateId: updateInfo.latestId,
              channel: UPDATE_CHANNEL,
            });
            return;
          }
        } catch (error) {
          console.warn('[update] managed install failed', error);
        } finally {
          setBusy(false);
        }
      }

      const candidateUri = downloadedApkUri || getFallbackApkFileUri();
      if (candidateUri) {
        try {
          const info = await FileSystem.getInfoAsync(candidateUri, { md5: true });
          const validChecksum =
            !updateInfo.checksumMd5 ||
            (info.exists && info.md5?.toLowerCase() === updateInfo.checksumMd5.toLowerCase());
          if (info.exists && validChecksum) {
            setBusy(true);
            setStage('opening');
            const deviceId = await getInstallId();
            await openDownloadedApk(candidateUri, updateInfo.downloadUrl);
            setStage('done');
            await logUpdateEvent({
              eventType: 'INSTALL_CLICK',
              platform: Platform.OS as 'android' | 'ios',
              versionCode,
              versionName,
              deviceId,
              updateId: updateInfo.latestId,
              channel: UPDATE_CHANNEL,
            });
            return;
          }
        } catch (error) {
          console.warn('[update] cached apk install failed', error);
        } finally {
          setBusy(false);
        }
      }
    }

    await startApkDownload(true);
  }, [
    androidDownloadId,
    downloadedApkUri,
    getFallbackApkFileUri,
    openDownloadedApk,
    openManagedDownloadedApk,
    readAndroidDownloadState,
    startApkDownload,
    updateInfo,
    verifyManagedDownloadedApk,
    versionCode,
    versionName,
  ]);

  const handleUpdate = installUpdate;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!updateInfo?.updateAvailable || !updateInfo.downloadUrl) return;
    if (busy || stage === 'downloading' || stage === 'verifying' || stage === 'opening' || stage === 'done') return;

    const version = updateInfo.latestVersionCode ?? 0;
    if (version > 0 && autoDownloadVersionRef.current === version) return;
    if (stage === 'error') return;

    autoDownloadVersionRef.current = version || Date.now();
    void startApkDownload(false);
  }, [
    busy,
    stage,
    startApkDownload,
    updateInfo?.downloadUrl,
    updateInfo?.latestVersionCode,
    updateInfo?.updateAvailable,
  ]);

  const handleClose = useCallback(async () => {
    if (downloadRef.current) {
      try {
        await downloadRef.current.pauseAsync();
      } catch {}
      downloadRef.current = null;
    }
    const deviceId = await getInstallId();
    await logUpdateEvent({
      eventType: 'DISMISS',
      platform: Platform.OS as 'android' | 'ios',
      versionCode,
      versionName,
      deviceId,
      updateId: updateInfo?.latestId,
      channel: UPDATE_CHANNEL,
    });
    setMandatoryVisible(false);
    setOptionalVisible(false);
    setStage('idle');
    setProgress(0);
    setErrorMessage(null);
  }, [updateInfo, versionCode, versionName]);

  const handleLater = useCallback(async () => {
    if (!mandatoryVisible && updateInfo?.latestVersionCode) {
      await AsyncStorage.setItem(
        getDismissKey(),
        String(updateInfo.latestVersionCode)
      );
    }

    const deviceId = await getInstallId();
    await logUpdateEvent({
      eventType: 'DISMISS',
      platform: Platform.OS as 'android' | 'ios',
      versionCode,
      versionName,
      deviceId,
      updateId: updateInfo?.latestId,
      channel: UPDATE_CHANNEL,
    });

    if (mandatoryVisible) {
      setMandatoryVisible(false);
    } else {
      setOptionalVisible(false);
    }
    setStage('idle');
    setProgress(0);
  }, [getDismissKey, mandatoryVisible, updateInfo, versionCode, versionName]);

  const showChecking = showCheckingOverlay && checkingVisible && !modalVisible;
  const isMandatory = mandatoryVisible;
  const showProgress = stage !== 'idle';
  const appUpdatePhase: AppBinaryUpdatePhase = useMemo(() => {
    if (!shouldCheck) return 'disabled';
    if (checkingVisible) return 'checking';
    if (!updateInfo?.updateAvailable) return stage === 'error' ? 'error' : 'idle';
    if (stage === 'done') return 'ready';
    if (stage === 'available') return 'available';
    return stage;
  }, [checkingVisible, shouldCheck, stage, updateInfo?.updateAvailable]);

  const requestAppUpdateStatusCheck = useCallback(async (source = 'manual') => {
    const result = await runCheck(source);
    return Boolean(result.ok && result.updateAvailable);
  }, [runCheck]);

  const dismissAppUpdateStatus = useCallback(async () => {
    setMandatoryVisible(false);
    setOptionalVisible(false);
    if (stage === 'available' || stage === 'error') {
      setStage('idle');
      setProgress(0);
      setErrorMessage(null);
    }
  }, [stage]);

  const appUpdateStatusValue = useMemo<AppBinaryUpdateStatusContextValue>(() => ({
    phase: appUpdatePhase,
    progress:
      appUpdatePhase === 'downloading' || appUpdatePhase === 'verifying' || appUpdatePhase === 'ready'
        ? Math.max(0, Math.min(100, progress)) / 100
        : null,
    updateInfo,
    latestVersionName: updateInfo?.latestVersionName ?? null,
    latestVersionCode: updateInfo?.latestVersionCode ?? null,
    fileSize: updateInfo?.fileSize ?? null,
    mandatory: Boolean(updateInfo?.mandatory),
    errorMessage,
    readyToInstall: appUpdatePhase === 'ready',
    isChecking: appUpdatePhase === 'checking',
    isDownloading: appUpdatePhase === 'downloading' || appUpdatePhase === 'verifying',
    isBusy: busy || appUpdatePhase === 'opening',
    lastCheckedAt: lastCheckAtRef.current || null,
    requestCheck: requestAppUpdateStatusCheck,
    startDownload: () => startApkDownload(false),
    installUpdate,
    dismissUpdate: dismissAppUpdateStatus,
  }), [
    appUpdatePhase,
    busy,
    dismissAppUpdateStatus,
    errorMessage,
    installUpdate,
    progress,
    requestAppUpdateStatusCheck,
    startApkDownload,
    updateInfo,
  ]);
  const primaryActionLabel = useMemo(() => {
    if (stage === 'downloading') return 'Скачивание...';
    if (stage === 'verifying') return 'Проверка...';
    if (stage === 'opening') return 'Открываем...';
    if (stage === 'done') {
      return Platform.OS === 'android' ? 'Установить' : 'Открыть';
    }
    return 'Обновить';
  }, [stage]);
  const primaryActionBusy = stage === 'downloading' || stage === 'verifying' || stage === 'opening';
  const primaryActionDisabled =
    primaryActionBusy || (!updateInfo?.downloadUrl && !updateInfo?.storeUrl);

  const progressLabel = useMemo(() => {
    if (stage === 'downloading') return `Загрузка ${progress}%`;
    if (stage === 'verifying') return 'Проверка файла...';
    if (stage === 'opening') {
      return Platform.OS === 'android'
        ? 'Открываем установщик. Завершите установку в системе.'
        : 'Открываем магазин приложений.';
    }
    if (stage === 'done') return 'Готово';
    if (stage === 'error') return 'Ошибка';
    return '';
  }, [progress, stage]);

  const description = useMemo(() => {
    if (!updateInfo) return '';
    if (isMandatory) {
      return 'Требуется обязательное обновление приложения.';
    }
    return 'Доступна новая версия приложения.';
  }, [updateInfo, isMandatory]);

  const sizeLabel = formatBytes(updateInfo?.fileSize ?? undefined);

  return (
    <AppUpdateStatusProvider value={appUpdateStatusValue}>
      <View style={{ flex: 1 }}>
        {children}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          void handleClose();
        }}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              void handleClose();
            }}
          />
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Обновление приложения</Text>
              <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={10}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.subtitle}>{description}</Text>
            {updateInfo?.latestVersionName ? (
              <Text style={styles.version}>Версия: v{updateInfo.latestVersionName}</Text>
            ) : null}
            {sizeLabel ? (
              <Text style={styles.version}>Размер: {sizeLabel}</Text>
            ) : null}
            {updateInfo?.releaseNotes ? (
              <Text style={styles.notes}>{updateInfo.releaseNotes}</Text>
            ) : null}

            {showProgress ? (
              <View style={styles.progressWrap}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.progressText}>{progressLabel}</Text>
              </View>
            ) : null}

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            <View style={styles.actions}>
              <Pressable style={[styles.button, styles.secondary]} onPress={handleLater} disabled={busy}>
                <Text style={styles.secondaryText}>Закрыть</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.primary, primaryActionDisabled && styles.primaryDisabled]}
                onPress={handleUpdate}
                disabled={primaryActionDisabled}
              >
                {primaryActionBusy ? (
                  <View style={styles.inlineBusy}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.primaryText}>{primaryActionLabel}</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryText}>{primaryActionLabel}</Text>
                )}
              </Pressable>
            </View>
            {!updateInfo?.downloadUrl && !updateInfo?.storeUrl ? (
              <Text style={styles.hint}>Ссылка на обновление недоступна. Обратитесь к администратору.</Text>
            ) : null}
          </View>
        </View>
      </Modal>
      <Modal
        visible={showChecking}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCheckingVisible(false);
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.checkingCard}>
            <ActivityIndicator size="large" color="#0ea5e9" />
            <Text style={styles.checkingText}>Проверка наличия обновлений</Text>
          </View>
        </View>
      </Modal>
      </View>
    </AppUpdateStatusProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#334155',
  },
  version: {
    marginTop: 8,
    fontSize: 13,
    color: '#64748b',
  },
  notes: {
    marginTop: 12,
    fontSize: 13,
    color: '#475569',
  },
  progressWrap: {
    marginTop: 12,
    gap: 6,
  },
  progressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0ea5e9',
  },
  progressText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  error: {
    marginTop: 12,
    fontSize: 12,
    color: '#dc2626',
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primary: {
    backgroundColor: '#0ea5e9',
  },
  primaryDisabled: {
    opacity: 0.7,
  },
  secondary: {
    backgroundColor: '#e2e8f0',
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryText: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: 14,
  },
  inlineBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hint: {
    marginTop: 12,
    fontSize: 12,
    color: '#94a3b8',
  },
  checkingCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  checkingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
  },
});
