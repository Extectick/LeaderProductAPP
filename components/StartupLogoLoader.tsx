import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

const splashLogo = require('../assets/images/splash.png');

type StartupLogoLoaderProps = {
  backgroundColor?: string;
};

export default function StartupLogoLoader({ backgroundColor = '#FFFFFF' }: StartupLogoLoaderProps) {
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.logoLayer} pointerEvents="none">
        <Image source={splashLogo} style={styles.logo} resizeMode="contain" />
      </View>
      <View style={styles.loaderLayer} pointerEvents="none">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoLayer: {
    ...StyleSheet.absoluteFillObject,
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
    alignItems: 'center',
  },
});
