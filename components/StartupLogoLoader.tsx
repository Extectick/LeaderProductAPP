import React from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const splashLogo = require('../assets/images/splash.png');

export type StartupLogoLoaderProps = {
  backgroundColor?: string;
  stage?: 'logo' | 'downloading' | 'applying';
  progress?: number | null;
};

export default function StartupLogoLoader({ backgroundColor = '#FFFFFF', stage = 'logo', progress = null }: StartupLogoLoaderProps) {
  const insets = useSafeAreaInsets();
  const value = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : null;
  const downloading = stage === 'downloading';
  const status = downloading ? 'Обновляем' : 'Запускаем';
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.logoLayer} pointerEvents="none">
        <Image source={splashLogo} style={styles.logo} resizeMode="contain" />
      </View>
      {stage !== 'logo' && <ScrollView style={[styles.loaderLayer, { bottom: insets.bottom + 16 }]} contentContainerStyle={styles.loaderContent} showsVerticalScrollIndicator={false}>
        <View style={styles.statusColumn}>
          <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
          {downloading && <ProgressBar progress={value ?? 0} indeterminate={value === null} color="#2563EB" style={styles.progress}
            accessibilityLabel={status} accessibilityValue={value === null ? { text: 'Выполняется' } : { min: 0, max: 100, now: Math.round(value * 100) }} />}
          {downloading && value !== null && <Text style={styles.percent}>{`${Math.round(value * 100)}%`}</Text>}
        </View>
      </ScrollView>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 200,
    height: 200,
  },
  loaderLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: 128,
  },
  loaderContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statusColumn: { width: '100%', maxWidth: 320 },
  status: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: '#0F172A', textAlign: 'center', marginBottom: 12 },
  progress: { height: 8, borderRadius: 4, backgroundColor: '#E0ECFF' },
  percent: { fontSize: 12, lineHeight: 16, color: '#1E40AF', fontWeight: '700', textAlign: 'center', marginTop: 8 },
});
