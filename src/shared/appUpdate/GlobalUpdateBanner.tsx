import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOtaUpdateStatus } from '@/src/shared/ota/OtaUpdateStatusContext';
import { useAppUpdateStatus } from './AppUpdateStatusContext';

const BANNER_HEIGHT = 34;

type Props = {
  children: React.ReactNode;
  onOpenApkUpdate: () => void;
};

function progressWidth(progress: number | null): DimensionValue {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%` as DimensionValue;
}

export default function GlobalUpdateBanner({ children, onOpenApkUpdate }: Props) {
  const insets = useSafeAreaInsets();
  const apk = useAppUpdateStatus();
  const ota = useOtaUpdateStatus();
  const animation = React.useRef(new Animated.Value(0)).current;

  const hasApkUpdate = Boolean(
    apk.updateInfo?.updateAvailable &&
      ['available', 'downloading', 'verifying', 'ready', 'opening', 'error'].includes(apk.phase)
  );
  const hasOtaUpdate = !hasApkUpdate && ['downloading', 'ready', 'restarting'].includes(ota.phase);
  const visible = hasApkUpdate || hasOtaUpdate;
  const downloading = hasApkUpdate
    ? apk.phase === 'downloading' || apk.phase === 'verifying'
    : ota.phase === 'downloading';
  const applying = hasApkUpdate ? apk.phase === 'opening' : ota.phase === 'restarting';
  const progress = hasApkUpdate ? apk.progress : ota.progress;
  const progressLabel = downloading && typeof progress === 'number'
    ? `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`
    : null;

  React.useEffect(() => {
    Animated.timing(animation, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      useNativeDriver: false,
    }).start();
  }, [animation, visible]);

  const handlePress = React.useCallback(() => {
    if (applying) return;
    if (hasApkUpdate) {
      onOpenApkUpdate();
      return;
    }
    if (ota.phase === 'ready') {
      void ota.reloadUpdate();
    }
  }, [applying, hasApkUpdate, onOpenApkUpdate, ota]);

  const reservedHeight = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BANNER_HEIGHT],
  });
  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [-BANNER_HEIGHT, 0],
  });

  return (
    <Animated.View style={[styles.layout, { paddingTop: reservedHeight }]}>
      {children}
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          styles.positioner,
          {
            top: Platform.OS === 'web' ? 0 : insets.top,
            opacity: animation,
            transform: [{ translateY }],
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Доступно обновление"
          disabled={applying}
          onPress={handlePress}
          style={({ pressed }) => [styles.banner, pressed && !applying ? styles.bannerPressed : null]}
        >
          {downloading || applying ? (
            <ActivityIndicator size={17} color="#15803D" />
          ) : (
            <MaterialCommunityIcons name="update" size={19} color="#15803D" />
          )}
          <Text style={styles.text}>Доступно обновление</Text>
          {progressLabel ? <Text style={styles.progressLabel}>{progressLabel}</Text> : null}
          {!downloading && !applying ? (
            <MaterialCommunityIcons name="chevron-right" size={18} color="#15803D" />
          ) : null}
          {downloading ? (
            <View pointerEvents="none" style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: progressWidth(progress) }]} />
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layout: {
    flex: 1,
  },
  positioner: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10000,
    elevation: 30,
  },
  banner: {
    minHeight: BANNER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#86EFAC',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  bannerPressed: {
    backgroundColor: '#DCFCE7',
  },
  text: {
    color: '#15803D',
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '900',
  },
  progressLabel: {
    color: '#166534',
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(21, 128, 61, 0.12)',
  },
  progressFill: {
    height: 2,
    backgroundColor: '#22C55E',
  },
});
