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
};

function formatBytes(bytes?: number | null) {
  if (!bytes || !Number.isFinite(bytes)) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} МБ`;
  const kb = bytes / 1024;
  return `${Math.max(1, Math.round(kb))} КБ`;
}

export default function UpdateGate({ children }: Props) {
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [mandatoryVisible, setMandatoryVisible] = useState(false);
  const [optionalVisible, setOptionalVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const checkingRef = useRef(false);
  const lastCheckAtRef = useRef(0);
  const promptLoggedForRef = useRef<number | null>(null);

  const versionName = Constants.expoConfig?.version ?? '0.0.0';
  const androidVersionCode = Number(Constants.expoConfig?.android?.versionCode ?? 0);
  const iosVersionCode = Number(Constants.expoConfig?.ios?.buildNumber ?? 0);
  const versionCode = Platform.OS === 'ios' ? iosVersionCode : androidVersionCode;

  const shouldCheck = Platform.OS === 'android' || Platform.OS === 'ios';

  const getEtagKey = useCallback(() => {
    return `${STORAGE_KEYS.etag}:${Platform.OS}:${UPDATE_CHANNEL}`;
  }, []);

  const runCheck = useCallback(
    async (source: string) => {
      if (!shouldCheck || checkingRef.current) return;
      if (!versionCode) return;

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
          return;
        }

        if (!result.ok || !result.data) return;

        const data = result.data;
        const dismissedRaw = await AsyncStorage.getItem(STORAGE_KEYS.dismissedVersionCode);
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
      }
    },
    [getEtagKey, shouldCheck, versionCode, versionName]
  );

  useEffect(() => {
    void runCheck('startup');
  }, [runCheck]);

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
    try {
      const deviceId = await getInstallId();

      if (Platform.OS === 'android' && updateInfo.downloadUrl && updateInfo.checksumMd5) {
        const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!baseDir) {
          setErrorMessage('Не удалось подготовить файл для обновления.');
          return;
        }
        const fileUri = `${baseDir}update_${updateInfo.latestVersionCode || Date.now()}.apk`;
        const result = await FileSystem.downloadAsync(updateInfo.downloadUrl, fileUri, { md5: true });
        if (result.md5 && updateInfo.checksumMd5 && result.md5.toLowerCase() !== updateInfo.checksumMd5.toLowerCase()) {
          setErrorMessage('Контрольная сумма файла не совпадает. Повторите загрузку.');
          return;
        }
        try {
          const contentUri = await FileSystem.getContentUriAsync(result.uri);
          await Linking.openURL(contentUri);
        } catch (e) {
          await Linking.openURL(updateInfo.downloadUrl);
        }

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

      await Linking.openURL(url);
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
      setErrorMessage('Не удалось открыть ссылку для обновления.');
    } finally {
      setBusy(false);
    }
  }, [updateInfo, versionCode, versionName]);

  const handleLater = useCallback(async () => {
    if (updateInfo?.latestVersionCode) {
      await AsyncStorage.setItem(
        STORAGE_KEYS.dismissedVersionCode,
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

    setOptionalVisible(false);
  }, [updateInfo, versionCode, versionName]);

  const modalVisible = mandatoryVisible || optionalVisible;
  const isMandatory = mandatoryVisible;

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
          if (!isMandatory) setOptionalVisible(false);
        }}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!isMandatory) setOptionalVisible(false);
            }}
          />
          <View style={styles.card}>
            <Text style={styles.title}>Обновление приложения</Text>
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

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            <View style={styles.actions}>
              {!isMandatory ? (
                <Pressable style={[styles.button, styles.secondary]} onPress={handleLater} disabled={busy}>
                  <Text style={styles.secondaryText}>Позже</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.button, styles.primary, busy && styles.primaryDisabled]}
                onPress={handleUpdate}
                disabled={busy || (!updateInfo?.downloadUrl && !updateInfo?.storeUrl)}
              >
                {busy ? (
                  <View style={styles.inlineBusy}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.primaryText}>Подготовка...</Text>
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
});
