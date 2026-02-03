import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import BrandedBackground from '@/components/BrandedBackground';

const logo = require('../assets/images/icon.png');

export default function StartupSplash() {
  return (
    <BrandedBackground speed={1.1}>
      <View style={styles.container}>
        <View style={styles.logoWrap}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.title}>Лидер Продукт</Text>
        <ActivityIndicator size="small" color="#0ea5e9" />
      </View>
    </BrandedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 24,
  },
  logoWrap: {
    width: 120,
    height: 120,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  logo: {
    width: 84,
    height: 84,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
});
