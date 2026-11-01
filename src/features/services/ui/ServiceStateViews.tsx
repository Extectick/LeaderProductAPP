import { servicesTokens, withOpacity } from './servicesTokens';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

type LoadingProps = { backgroundColor: string; textColor: string; style?: any; columns?: number; cardSize?: number; gap?: number; horizontalPadding?: number; topPadding?: number };
type ErrorProps = { backgroundColor: string; textColor: string; title?: string; message?: string | null; style?: any };

function LoadingRow({ width, color }: { width: number; color: string }) {
  const reduced = useReducedMotion();
  const shimmer = useSharedValue(0.5);
  React.useEffect(() => {
    if (!reduced) shimmer.value = withRepeat(withTiming(0.9, { duration: 800 }), -1, true);
    return () => cancelAnimation(shimmer);
  }, [reduced, shimmer]);
  const animated = useAnimatedStyle(() => ({ opacity: reduced ? 0.7 : shimmer.value }));
  const fill = withOpacity(color, 0.1);
  return <Animated.View style={[styles.loadingRow, { width }, animated]}>
    <View style={[styles.loadingIcon, { backgroundColor: fill }]}/>
    <View style={styles.loadingCopy}>
      <View style={[styles.loadingTitle, { backgroundColor: fill }]}/>
      <View style={[styles.loadingDescription, { backgroundColor: fill }]}/>
    </View>
  </Animated.View>;
}

export function ServicesLoadingView({ backgroundColor, textColor, style, cardSize = 320, horizontalPadding = 20, topPadding = 0 }: LoadingProps) {
  return <View testID="services-loading" style={[styles.loadingShell, { backgroundColor, paddingTop: topPadding, paddingHorizontal: horizontalPadding }, style]}>
    {Array.from({ length: 6 }, (_, index) => <LoadingRow key={index} width={cardSize} color={textColor}/>)}
  </View>;
}

export function ServicesEmptyView({ textColor }: { textColor: string }) {
  return <View style={styles.empty}>
    <Ionicons name="apps-outline" size={32} color={withOpacity(textColor, 0.35)}/>
    <Text style={[styles.message, { color: withOpacity(textColor, 0.6) }]}>Сервисы появятся здесь</Text>
  </View>;
}

export function ServicesErrorView({ backgroundColor, textColor, title, message, style }: ErrorProps) {
  return <View style={[styles.shell, { backgroundColor }, style]}>
    <Ionicons name="cloud-offline-outline" size={32} color={withOpacity(textColor, 0.45)}/>
    <Text style={[styles.title, { color: textColor }]}>{title || 'Не удалось загрузить сервисы'}</Text>
    <Text style={[styles.message, { color: withOpacity(textColor, 0.6) }]}>{message || 'Проверьте соединение и обновите страницу.'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 10 },
  empty: { paddingVertical: 56, paddingHorizontal: 20, alignItems: 'center', gap: 12 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 400 },
  loadingShell: { flex: 1, alignItems: 'center' },
  loadingRow: { minHeight: servicesTokens.row.minHeight, flexDirection: 'row', alignItems: 'center', gap: servicesTokens.row.gap, paddingHorizontal: servicesTokens.row.paddingHorizontal },
  loadingIcon: { width: 56, height: 56, borderRadius: 17 },
  loadingCopy: { flex: 1, gap: 11 },
  loadingTitle: { width: '61%', height: 16, borderRadius: 5 },
  loadingDescription: { width: '90%', height: 12, borderRadius: 4 },
});
