import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { getAppVersionInfo } from '@/utils/appVersion';
import { requestAppUpdateCheck } from '@/utils/updateCheckRequests';
import React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

type Props = {
  loadServices: (force?: boolean) => Promise<void>;
};

function formatDateTime(value: number | null) {
  if (!value) return 'нет данных';
  const date = new Date(value);
  const pad = (next: number) => String(next).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ServicesCatalogStatusAction({ loadServices }: Props) {
  const serverStatus = useServerStatus();
  const [busy, setBusy] = React.useState(false);

  const online = serverStatus.isReachable;
  const color = online ? '#059669' : '#DC2626';
  const bg = 'rgba(255, 255, 255, 0.72)';
  const border = online ? 'rgba(5, 150, 105, 0.2)' : 'rgba(220, 38, 38, 0.22)';

  const handlePress = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Promise.all([
        requestAppUpdateCheck(),
        loadServices(true),
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, loadServices]);

  const handleLongPress = React.useCallback(() => {
    const version = getAppVersionInfo();
    const serverLabel = online ? 'доступен' : 'недоступен';
    const lastOnline = formatDateTime(serverStatus.lastReachableAt);
    const reason = serverStatus.lastReason ? `\nПричина: ${serverStatus.lastReason}` : '';

    Alert.alert(
      '',
      `Версия: ${version.fullVersionLabel}\nСервер: ${serverLabel}\nПоследнее соединение: ${lastOnline}${reason}`
    );
  }, [online, serverStatus.lastReachableAt, serverStatus.lastReason]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={online ? 'Сервер доступен, обновить данные' : 'Сервер недоступен, повторить проверку'}
      delayLongPress={450}
      disabled={busy}
      onLongPress={handleLongPress}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border },
        pressed && !busy ? styles.pressed : null,
        busy ? styles.busy : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <View style={[styles.statusRing, { borderColor: border }]}>
          <View style={[styles.statusCore, { backgroundColor: color }]} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 999,
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
});
