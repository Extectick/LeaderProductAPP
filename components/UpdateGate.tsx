import AsyncStorage from '@react-native-async-storage/async-storage';
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
  AndroidApkDownloadState,
  enqueueAndroidApkDownload,
  getAndroidApkDownloadStatus,
  isAndroidApkDownloadSupported,
  openAndroidDownloadedApk,
  removeAndroidApkDownload,
} from '@/utils/androidApkDownload';

const STORAGE_KEYS = {
  dismissedVersionCode: 'update:dismissedVersionCode',
  etag: 'update:etag',
  androidDownload: 'update:androidDownload',
};

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const UPDATE_CHANNEL = process.env.EXPO_PUBLIC_UPDATE_CHANNEL || 'prod';
const ANDROID_APK_INSTALL_ACTION = 'android.intent.action.VIEW';
const ANDROID_APK_MIME = 'application/vnd.android.package-archive';
const ANDROID_INSTALL_INTENT_FLAGS = 1 | 268435456;

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
  const [stage, setStage] = useState<
    'idle' | 'downloading' | 'verifying' | 'opening' | 'done' | 'error'
  >('idle');
  const checkingRef = useRef(false);
  const lastCheckAtRef = useRef(0);
  const promptLoggedForRef = useRef<number | null>(null);
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);
  const startupDoneRef = useRef(false);
  const startupCheckStartedRef = useRef(false);

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

  const versionName = Constants.expoConfig?.version ?? '0.0.0';
  const androidVersionCode = Number(Constants.expoConfig?.android?.versionCode ?? 0);
  const iosVersionCode = Number(Constants.expoConfig?.ios?.buildNumber ?? 0);
  const androidPackageName = Constants.expoConfig?.android?.package ?? 'com.leaderproduct.app';
  const versionCode = Platform.OS === 'ios' ? iosVersionCode : androidVersionCode;

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

  const buildAndroidApkFileName = useCallback(() => {
    const nextVersion = updateInfo?.latestVersionCode || Date.now();
    return `leader-product-update-${nextVersion}.apk`;
  }, [updateInfo?.latestVersionCode]);

  const getEtagKey = useCallback(() => {
    return `${STORAGE_KEYS.etag}:${Platform.OS}:${UPDATE_CHANNEL}`;
  }, []);

  const getDismissKey = useCallback(() => {
    return `${STORAGE_KEYS.dismissedVersionCode}:${Platform.OS}:${UPDATE_CHANNEL}`;
  }, []);

  const runCheck = useCallback(
    async (source: string) => {
      if (!shouldCheck || checkingRef.current) return;
      if (!versionCode) return;

      if (source === 'startup') {
        setCheckingVisible(true);
      }
      checkingRef.current = true;
      try {
        const deviceId = await getInstallId();
        const etagKey = getEtagKey();
        const storedEtag = await AsyncStorage.getItem(etagKey);

        const result = await checkForUpdate({
          platform: Platform.OS as 'android' | 'ios',
          versionCode,
          versionName,
          deviceId,
          channel: UPDATE_CHANNEL,
          ifNoneMatch: storedEtag,
        });

        if (result.etag) {
          await AsyncStorage.setItem(etagKey, result.etag);
        }

        if (result.notModified) {
          lastCheckAtRef.current = Date.now();
          return;
        }

        if (!result.ok || !result.data) return;

        const data = result.data;
        const dismissedRaw = await AsyncStorage.getItem(getDismissKey());
        const dismissedCode = dismissedRaw ? Number(dismissedRaw) : undefined;

        const updateAvailable = Boolean(data.updateAvailable);
        const mandatory = Boolean(data.mandatory);
        const latestVersionCode = data.latestVersionCode ?? 0;

        const shouldShowOptional =
          updateAvailable &&
          !mandatory &&
          (latestVersionCode <= 0 || dismissedCode !== latestVersionCode);

        setUpdateInfo(data);
        setMandatoryVisible(updateAvailable && mandatory);
        setOptionalVisible(shouldShowOptional);
        setErrorMessage(null);
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
      } catch (e) {
        console.warn('[update] check failed', source, e);
      } finally {
        checkingRef.current = false;
        setCheckingVisible(false);
        if (source === 'startup') {
          completeStartup();
        }
      }
    },
    [completeStartup, getDismissKey, getEtagKey, shouldCheck, versionCode, versionName]
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
    if (!modalVisible) return;
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
        setStage((current) => (current === 'error' ? current : 'done'));
        setProgress(100);
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
    modalVisible,
    readAndroidDownloadState,
    updateInfo?.downloadUrl,
    updateInfo?.latestVersionCode,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!isAndroidApkDownloadSupported()) return;
    if (!modalVisible) return;
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
        setProgress(100);
        setStage((current) => (current === 'error' ? current : 'done'));
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
  }, [androidDownloadId, busy, clearAndroidDownloadState, modalVisible]);

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

  const handleUpdate = useCallback(async () => {
    setErrorMessage(null);
    if (!updateInfo) return;

    const url = updateInfo.storeUrl || updateInfo.downloadUrl;
    if (!url) {
      setErrorMessage('Ссылка на обновление недоступна.');
      return;
    }

    setBusy(true);
    setProgress(0);
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
              setProgress(100);
              setStage('opening');
              await openManagedDownloadedApk(saved.downloadId);
              setStage('done');
              await logUpdateEvent({
                eventType: 'UPDATE_CLICK',
                platform: Platform.OS as 'android' | 'ios',
                versionCode,
                versionName,
                deviceId,
                updateId: updateInfo.latestId,
                channel: UPDATE_CHANNEL,
              });
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
        await logUpdateEvent({
          eventType: 'UPDATE_CLICK',
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
        const fileUri = `${folder}update_${versionTag}.apk`;

        try {
          await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
        } catch {}

        const cached = await FileSystem.getInfoAsync(fileUri, { md5: true });
        if (cached.exists && cached.md5 && cached.md5.toLowerCase() === updateInfo.checksumMd5.toLowerCase()) {
          setProgress(100);
          setStage('opening');
          await openDownloadedApk(fileUri, updateInfo.downloadUrl);
          setProgress(100);
          setStage('done');
          await logUpdateEvent({
            eventType: 'UPDATE_CLICK',
            platform: Platform.OS as 'android' | 'ios',
            versionCode,
            versionName,
            deviceId,
            updateId: updateInfo.latestId,
            channel: UPDATE_CHANNEL,
          });
          return;
        }

        if (cached.exists) {
          try {
            await FileSystem.deleteAsync(fileUri, { idempotent: true });
          } catch {}
        }

        setStage('downloading');
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
          return;
        }
        setStage('opening');
        await openDownloadedApk(result.uri, updateInfo.downloadUrl);
        setProgress(100);
        setStage('done');

        await logUpdateEvent({
          eventType: 'UPDATE_CLICK',
          platform: Platform.OS as 'android' | 'ios',
          versionCode,
          versionName,
          deviceId,
          updateId: updateInfo.latestId,
          channel: UPDATE_CHANNEL,
        });
        return;
      }

      setStage('opening');
      await Linking.openURL(url);
      setProgress(100);
      setStage('done');
      await logUpdateEvent({
        eventType: 'UPDATE_CLICK',
        platform: Platform.OS as 'android' | 'ios',
        versionCode,
        versionName,
        deviceId,
        updateId: updateInfo.latestId,
        channel: UPDATE_CHANNEL,
      });
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
    openDownloadedApk,
    openManagedDownloadedApk,
    readAndroidDownloadState,
    saveAndroidDownloadState,
    updateInfo,
    versionCode,
    versionName,
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
