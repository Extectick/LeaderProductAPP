import { BlurView, type BlurTint } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const DEFAULT_WEB_BACKDROP_FILTER = 'blur(20px) saturate(160%)';
const DEFAULT_BLUR_INTENSITY = 36;

type LiquidGlassSurfaceProps = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderColor: string;
  overlayColor: string;
  blurIntensity?: number;
  blurTint?: BlurTint;
  specularOpacity?: number;
  depthOpacity?: number;
  webBackdropFilter?: string;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function LiquidGlassSurface({
  children,
  style,
  borderColor,
  overlayColor,
  blurIntensity = DEFAULT_BLUR_INTENSITY,
  blurTint = 'light',
  specularOpacity,
  depthOpacity,
  webBackdropFilter = DEFAULT_WEB_BACKDROP_FILTER,
  pointerEvents = 'auto',
  onLayout,
}: LiquidGlassSurfaceProps) {
  const isWeb = Platform.OS === 'web';

  const webBlurStyle = useMemo(() => {
    if (!isWeb) return undefined;
    return {
      backdropFilter: webBackdropFilter,
      WebkitBackdropFilter: webBackdropFilter,
    } as ViewStyle;
  }, [isWeb, webBackdropFilter]);

  return (
    <View
      pointerEvents={pointerEvents}
      onLayout={onLayout}
      style={[styles.surface, style, { borderColor }]}
    >
      {isWeb ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.webBlur,
            { backgroundColor: overlayColor },
            webBlurStyle,
          ]}
        />
      ) : (
        <>
          <BlurView
            tint={blurTint}
            intensity={blurIntensity}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]}
          />
        </>
      )}
      {typeof specularOpacity === 'number' && specularOpacity > 0 ? (
        <LinearGradient
          pointerEvents="none"
          colors={[`rgba(255, 255, 255, ${specularOpacity})`, 'rgba(255, 255, 255, 0)']}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.86, y: 0.78 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {typeof depthOpacity === 'number' && depthOpacity > 0 ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0, 0, 0, 0)', `rgba(0, 0, 0, ${depthOpacity})`]}
          start={{ x: 0.5, y: 0.12 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    alignSelf: 'stretch',
    width: '100%',
    borderWidth: 1,
    overflow: 'hidden',
  },
  webBlur: {
    ...StyleSheet.absoluteFill,
  },
});
