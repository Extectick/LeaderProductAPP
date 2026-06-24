import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import BrandedBackground from '@/components/BrandedBackground';

const logo = require('../assets/images/icon.png');

type StartupSplashProps = {
  statusText?: string;
  hintText?: string;
  progress?: number | null;
};

export default function StartupSplash({
  statusText = 'Запуск приложения',
  hintText = 'Подготавливаем рабочее пространство',
  progress = null,
}: StartupSplashProps) {
  const normalizedProgress =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.max(0, Math.min(1, progress))
      : null;
  const progressPercent = normalizedProgress === null ? 0 : Math.round(normalizedProgress * 100);

  return (
    <BrandedBackground speed={1.1}>
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.logoWrap}>
            <Image source={logo} style={styles.logo} resizeMode="contain" />
          </View>

          <Text style={styles.title}>Лидер Продукт</Text>
          <Text style={styles.status}>{statusText}</Text>
          <Text style={styles.hint}>{hintText}</Text>

          {normalizedProgress !== null ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
              </View>
              <Text style={styles.progressText}>{progressPercent}%</Text>
            </View>
          ) : null}

          <View style={styles.loaderWrap}>
            <View style={styles.loaderCircle}>
              <ActivityIndicator size="large" color="#1D4ED8" />
            </View>
          </View>
        </View>
      </View>
    </BrandedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    alignItems: 'center',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 26,
    backgroundColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 9,
  },
  logoWrap: {
    width: 148,
    height: 148,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  logo: {
    width: 104,
    height: 104,
  },
  title: {
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 10,
  },
  status: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#334155',
    opacity: 0.9,
    textAlign: 'center',
    maxWidth: 320,
  },
  loaderWrap: {
    marginTop: 18,
    paddingTop: 8,
  },
  progressWrap: {
    width: '100%',
    maxWidth: 300,
    marginTop: 16,
    gap: 7,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E0ECFF',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2563EB',
  },
  progressText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#1E40AF',
    textAlign: 'center',
  },
  loaderCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
});
