import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/useThemeColor';
import { API_BASE_URL } from '@/utils/config';
import { getAppVersionInfo } from '@/utils/appVersion';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { useOtaUpdateStatus } from '@/src/shared/ota/OtaUpdateStatusContext';
import { useAppUpdateStatus } from '@/src/shared/appUpdate/AppUpdateStatusContext';

type Props = {
  onIdlePress?: () => Promise<void> | void;
  idleBusy?: boolean;
  size?: number;
};

type ModalMode = 'status' | 'details' | null;

type ActiveUpdateKind = 'apk' | 'ota' | null;

function formatDateTime(timestamp?: number | null) {
  if (!timestamp || !Number.isFinite(timestamp)) return '—';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return '—';
  }
}

function percentLabel(progress: number | null) {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`;
}

function progressWidth(progress: number | null): DimensionValue {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%` as DimensionValue;
}

function formatBytes(bytes?: number | null) {
  if (!bytes || !Number.isFinite(bytes)) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

function otaLabel(phase: string, progress: number | null) {
  if (phase === 'downloading') return `OTA скачивается ${percentLabel(progress)}`;
  if (phase === 'ready') return 'OTA готово к применению';
  if (phase === 'checking') return 'Проверка OTA';
  if (phase === 'restarting') return 'Перезапуск приложения';
  if (phase === 'error') return 'OTA временно недоступно';
  if (phase === 'disabled') return 'OTA отключено';
  return 'OTA обновлений нет';
}

export default function AppStatusIndicator({ onIdlePress, idleBusy = false, size = 32 }: Props) {
  const serverStatus = useServerStatus();
  const otaStatus = useOtaUpdateStatus();
  const appUpdateStatus = useAppUpdateStatus();
  const [modalMode, setModalMode] = React.useState<ModalMode>(null);
  const [actionBusy, setActionBusy] = React.useState(false);
  const text = useThemeColor({}, 'text');

  const online = serverStatus.isReachable;
  const isApkDownloading = appUpdateStatus.phase === 'downloading' || appUpdateStatus.phase === 'verifying';
  const isApkReady = appUpdateStatus.phase === 'ready';
  const isApkAvailable = appUpdateStatus.phase === 'available';
  const isApkChecking = appUpdateStatus.phase === 'checking';
  const isApkOpening = appUpdateStatus.phase === 'opening';
  const isApkError = appUpdateStatus.phase === 'error' && Boolean(appUpdateStatus.updateInfo);
  const hasApkState = isApkDownloading || isApkReady || isApkAvailable || isApkChecking || isApkOpening || isApkError;
  const isOtaDownloading = !hasApkState && otaStatus.phase === 'downloading';
  const isOtaReady = !hasApkState && otaStatus.phase === 'ready';
  const isOtaChecking = !hasApkState && otaStatus.phase === 'checking';
  const isOtaRestarting = otaStatus.phase === 'restarting';
  const activeUpdateKind: ActiveUpdateKind = hasApkState ? 'apk' : (isOtaDownloading || isOtaReady || isOtaChecking || otaStatus.phase === 'error' ? 'ota' : null);
  const activeProgress = activeUpdateKind === 'apk' ? appUpdateStatus.progress : otaStatus.progress;
  const effectiveBusy = idleBusy || actionBusy || isOtaRestarting || isApkOpening;

  const color = isApkDownloading || isApkChecking || isOtaDownloading
    ? '#2563EB'
    : isApkReady || isApkAvailable || isOtaReady
      ? '#7C3AED'
      : isApkError
        ? '#D97706'
      : online
        ? '#059669'
        : '#DC2626';
  const border = hasApkState || isOtaDownloading || isOtaReady
    ? 'rgba(37, 99, 235, 0.25)'
    : online
      ? 'rgba(5, 150, 105, 0.2)'
      : 'rgba(220, 38, 38, 0.22)';
  const bg = isApkReady || isApkAvailable || isOtaReady ? 'rgba(124, 58, 237, 0.1)' : 'rgba(255, 255, 255, 0.72)';

  const handlePress = React.useCallback(async () => {
    if (effectiveBusy) return;
    if (hasApkState || isOtaReady || isOtaDownloading || isOtaChecking || otaStatus.phase === 'error') {
      setModalMode('status');
      return;
    }
    if (onIdlePress) {
      setActionBusy(true);
      try {
        await onIdlePress();
      } finally {
        setActionBusy(false);
      }
      return;
    }
    setActionBusy(true);
    try {
      await Promise.all([
        otaStatus.requestCheck('manual').catch(() => false),
        appUpdateStatus.requestCheck('manual').catch(() => false),
      ]);
    } finally {
      setActionBusy(false);
    }
    setModalMode('status');
  }, [appUpdateStatus, effectiveBusy, hasApkState, isOtaChecking, isOtaDownloading, isOtaReady, onIdlePress, otaStatus]);

  const handleReload = React.useCallback(async () => {
    setActionBusy(true);
    try {
      await otaStatus.reloadUpdate();
    } finally {
      setActionBusy(false);
    }
  }, [otaStatus]);

  const handleDownloadApk = React.useCallback(async () => {
    setActionBusy(true);
    try {
      await appUpdateStatus.startDownload();
    } finally {
      setActionBusy(false);
    }
  }, [appUpdateStatus]);

  const handleInstallApk = React.useCallback(async () => {
    setActionBusy(true);
    try {
      await appUpdateStatus.installUpdate();
    } finally {
      setActionBusy(false);
    }
  }, [appUpdateStatus]);

  const handleRetryApk = React.useCallback(async () => {
    setActionBusy(true);
    try {
      const found = await appUpdateStatus.requestCheck('manual');
      if (found) {
        await appUpdateStatus.startDownload();
      }
    } finally {
      setActionBusy(false);
    }
  }, [appUpdateStatus]);

  const handleLater = React.useCallback(() => {
    setModalMode(null);
  }, []);

  const version = React.useMemo(() => getAppVersionInfo(), [modalMode]);
  const title = isApkReady
    ? 'APK загружен'
    : isApkDownloading
      ? 'Скачиваем APK'
      : isApkChecking
        ? 'Проверка обновлений'
      : isApkAvailable
        ? 'Доступна новая версия'
        : isApkError
          ? 'Ошибка обновления'
          : isOtaReady
    ? 'Обновление готово'
    : isOtaDownloading
      ? 'Скачиваем обновление'
      : online
        ? 'Сервер доступен'
        : 'Сервер недоступен';
  const description = isApkReady
    ? 'Файл приложения загружен. Запустите установку, чтобы перейти на новую версию.'
    : isApkDownloading
      ? `Скачиваем версию v${appUpdateStatus.latestVersionName || appUpdateStatus.latestVersionCode || '—'} в фоне.`
      : isApkChecking
        ? 'Проверяем наличие новой версии приложения.'
      : isApkAvailable
        ? `Доступна версия v${appUpdateStatus.latestVersionName || appUpdateStatus.latestVersionCode || '—'}.`
        : isApkError
          ? appUpdateStatus.errorMessage || 'Не удалось загрузить обновление приложения.'
          : isOtaReady
    ? 'Приложение будет перезапущено, чтобы открыть новую версию интерфейса.'
    : isOtaDownloading
      ? 'OTA обновление загружается в фоне. APK переустанавливать не нужно.'
      : online
        ? 'Соединение с сервером активно.'
        : 'Нет соединения с сервером. Данные на экране могут быть неактуальными.';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        delayLongPress={450}
        disabled={effectiveBusy && !isOtaRestarting}
        onLongPress={() => setModalMode('details')}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.button,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderColor: border },
          pressed && !effectiveBusy ? styles.pressed : null,
          effectiveBusy ? styles.busy : null,
        ]}
      >
        {effectiveBusy && !isApkChecking && !isApkDownloading && !isApkReady && !isApkAvailable && !isOtaDownloading && !isOtaReady ? (
          <ActivityIndicator size="small" color={color} />
        ) : isApkChecking ? (
          <ActivityIndicator size="small" color={color} />
        ) : isApkDownloading || isOtaDownloading ? (
          <ProgressRing size={size - 8} color={color} progress={activeProgress ?? 0} />
        ) : isApkReady || isOtaReady ? (
          <Ionicons name="refresh-circle" size={size - 10} color={color} />
        ) : isApkAvailable ? (
          <Ionicons name="download-outline" size={size - 14} color={color} />
        ) : isApkError ? (
          <Ionicons name="alert-circle-outline" size={size - 12} color={color} />
        ) : (
          <View style={[styles.statusRing, { borderColor: border }]}>
            <View style={[styles.statusCore, { backgroundColor: color }]} />
          </View>
        )}
      </Pressable>

      <Modal
        visible={modalMode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setModalMode(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setModalMode(null)}>
          <Pressable
            onPress={(event) => event.stopPropagation?.()}
            style={[styles.card, { borderColor: isOtaReady ? 'rgba(124, 58, 237, 0.26)' : `${color}33` }]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrap, { backgroundColor: `${color}18`, borderColor: `${color}44` }]}>
                {isApkChecking ? (
                  <ActivityIndicator size="small" color={color} />
                ) : isApkDownloading || isOtaDownloading ? (
                  <ProgressRing size={22} color={color} progress={activeProgress ?? 0} />
                ) : isApkReady || isOtaReady ? (
                  <Ionicons name="refresh" size={17} color={color} />
                ) : isApkAvailable ? (
                  <Ionicons name="download-outline" size={17} color={color} />
                ) : isApkError ? (
                  <Ionicons name="alert-circle-outline" size={17} color={color} />
                ) : (
                  <View style={[styles.statusCore, { backgroundColor: color }]} />
                )}
              </View>
              <Text style={[styles.title, { color: text }]}>{modalMode === 'details' ? 'Состояние приложения' : title}</Text>
              <Pressable
                onPress={() => setModalMode(null)}
                style={({ pressed }) => [styles.closeBtn, pressed ? styles.closeBtnPressed : null]}
              >
                <Ionicons name="close-outline" size={18} color="#64748B" />
              </Pressable>
            </View>

            {modalMode === 'details' ? (
              <View style={styles.rows}>
                <InfoRow label="Версия" value={version.fullVersionLabel} />
                <InfoRow label="OTA" value={`${otaLabel(otaStatus.phase, otaStatus.progress)}${otaStatus.targetVersionLabel ? ` · ${otaStatus.targetVersionLabel}` : ''}`} />
                <InfoRow label="APK update" value={appUpdateStatus.phase === 'idle' ? 'Нет обновления' : `${title}${appUpdateStatus.latestVersionName ? ` v${appUpdateStatus.latestVersionName}` : ''}`} />
                <InfoRow label="Сервер" value={online ? 'Доступен' : 'Недоступен'} />
                <InfoRow label="API адрес" value={API_BASE_URL || '—'} />
                <InfoRow label="Последнее соединение" value={formatDateTime(serverStatus.lastReachableAt)} />
                <InfoRow label="Потеря соединения" value={formatDateTime(serverStatus.lastUnavailableAt)} />
                <InfoRow label="Причина" value={serverStatus.lastReason || otaStatus.errorMessage || '—'} />
              </View>
            ) : (
              <View style={styles.rows}>
                <Text style={styles.description}>{description}</Text>
                {isApkDownloading || isOtaDownloading ? (
                  <View style={styles.progressBlock}>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: progressWidth(activeProgress), backgroundColor: color }]} />
                    </View>
                    <Text style={[styles.progressText, { color }]}>{percentLabel(activeProgress)}</Text>
                    {activeUpdateKind === 'apk' ? (
                      <Text style={styles.progressMeta}>
                        Версия: v{appUpdateStatus.latestVersionName || appUpdateStatus.latestVersionCode || '—'} · Размер: {formatBytes(appUpdateStatus.fileSize)}
                      </Text>
                    ) : otaStatus.targetVersionLabel ? (
                      <Text style={styles.progressMeta}>Версия: {otaStatus.targetVersionLabel}</Text>
                    ) : null}
                  </View>
                ) : null}
                {!isOtaDownloading && !isOtaReady && !online ? (
                  <>
                    <InfoRow label="API адрес" value={API_BASE_URL || '—'} />
                    <InfoRow label="Последнее соединение" value={formatDateTime(serverStatus.lastReachableAt)} />
                    <InfoRow label="Причина" value={serverStatus.lastReason || '—'} />
                  </>
                ) : null}
              </View>
            )}

            {(isApkReady || isApkAvailable || isApkError || isOtaReady) && modalMode !== 'details' ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={handleLater}
                  style={({ pressed }) => [styles.secondaryBtn, pressed ? styles.actionPressed : null]}
                >
                  <Text style={styles.secondaryBtnText}>Позже</Text>
                </Pressable>
                <Pressable
                  onPress={
                    isApkReady
                      ? handleInstallApk
                      : isApkAvailable
                        ? handleDownloadApk
                        : isApkError
                          ? handleRetryApk
                          : handleReload
                  }
                  disabled={actionBusy}
                  style={({ pressed }) => [styles.primaryBtn, actionBusy ? styles.busy : null, pressed && !actionBusy ? styles.actionPressed : null]}
                >
                  {actionBusy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      {isApkReady ? 'Установить' : isApkAvailable ? 'Скачать' : isApkError ? 'Повторить' : 'Обновить'}
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ProgressRing({ size, color, progress }: { size: number; color: string; progress: number }) {
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(37,99,235,0.18)"
          strokeWidth={stroke}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <View style={[styles.statusCore, styles.progressCore, { backgroundColor: color }]} />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  busy: {
    opacity: 0.86,
  },
  statusRing: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  statusCore: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  progressCore: {
    position: 'absolute',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 7,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: {
    opacity: 0.85,
  },
  rows: {
    gap: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 19,
    color: '#334155',
    fontWeight: '600',
  },
  progressText: {
    fontSize: 22,
    color: '#2563EB',
    fontWeight: '800',
  },
  progressBlock: {
    gap: 7,
  },
  progressBar: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressMeta: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  infoRow: {
    gap: 2,
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  infoValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '800',
  },
  actionPressed: {
    opacity: 0.86,
  },
});
