import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
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

const STORAGE_KEYS = {
  dismissedVersionCode: 'update:dismissedVersionCode',
  etag: 'update:etag',
};

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const UPDATE_CHANNEL = process.env.EXPO_PUBLIC_UPDATE_CHANNEL || 'prod';

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
  const [stage, setStage] = useState<
    'idle' | 'downloading' | 'verifying' | 'opening' | 'done' | 'error'
  >('idle');
  const checkingRef = useRef(false);
  const lastCheckAtRef = useRef(0);
  const promptLoggedForRef = useRef<number | null>(null);
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);
  const startupDoneRef = useRef(false);

  const completeStartup = useCallback(() => {
    if (startupDoneRef.current) return;
    startupDoneRef.current = true;
    onStartupDone?.();
  }, [onStartupDone]);

  const versionName = Constants.expoConfig?.version ?? '0.0.0';
  const androidVersionCode = Number(Constants.expoConfig?.android?.versionCode ?? 0);
  const iosVersionCode = Number(Constants.expoConfig?.ios?.buildNumber ?? 0);
  const versionCode = Platform.OS === 'ios' ? iosVersionCode : androidVersionCode;

  const shouldCheck = Platform.OS === 'android' || Platform.OS === 'ios';

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
    if (!shouldCheck || !versionCode) {
      completeStartup();
      return;
    }
    void runCheck('startup');
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
          try {
            const contentUri = await FileSystem.getContentUriAsync(fileUri);
            await Linking.openURL(contentUri);
          } catch (e) {
            await Linking.openURL(updateInfo.downloadUrl);
          }
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
        setStage('verifying');
        if (result.md5 && updateInfo.checksumMd5 && result.md5.toLowerCase() !== updateInfo.checksumMd5.toLowerCase()) {
          setErrorMessage('Контрольная сумма файла не совпадает. Повторите загрузку.');
          setStage('error');
          return;
        }
        try {
          setStage('opening');
          const contentUri = await FileSystem.getContentUriAsync(result.uri);
          await Linking.openURL(contentUri);
        } catch (e) {
          setStage('opening');
          await Linking.openURL(updateInfo.downloadUrl);
        }
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
  }, [updateInfo, versionCode, versionName]);

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

  const modalVisible = mandatoryVisible || optionalVisible;
  const showChecking = showCheckingOverlay && checkingVisible && !modalVisible;
  const isMandatory = mandatoryVisible;
  const showProgress = stage !== 'idle';

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
                style={[styles.button, styles.primary, busy && styles.primaryDisabled]}
                onPress={handleUpdate}
                disabled={busy || (!updateInfo?.downloadUrl && !updateInfo?.storeUrl)}
              >
                {busy ? (
                  <View style={styles.inlineBusy}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.primaryText}>В процессе...</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryText}>Обновить</Text>
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
