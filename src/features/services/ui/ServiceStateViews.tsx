import { servicesTokens, withOpacity } from '@/src/features/services/ui/servicesTokens';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type LoadingProps = {
  backgroundColor: string;
  textColor: string;
  style?: any;
  columns?: number;
  cardSize?: number;
  gap?: number;
  horizontalPadding?: number;
  topPadding?: number;
};

type ErrorProps = {
  backgroundColor: string;
  textColor: string;
  title?: string;
  message?: string | null;
  style?: any;
};

function LoadingCard({ size }: { size: number }) {
  const reduceMotion = useReducedMotion();
  const shimmer = useSharedValue(0.6);

  React.useEffect(() => {
    if (reduceMotion) return;
    shimmer.value = withRepeat(withTiming(1, { duration: 780 }), -1, true);
  }, [reduceMotion, shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.82 : shimmer.value,
  }));

  return (
    <Animated.View
      style={[
        styles.loadingCard,
        shimmerStyle,
        {
          width: size,
          minHeight: servicesTokens.card.minHeight,
        },
      ]}
    >
      <View style={styles.loadingIcon} />
      <View style={styles.loadingTextBlock}>
        <View style={styles.loadingLineLg} />
        <View style={styles.loadingLineMd} />
        <View style={styles.loadingLineSm} />
      </View>
      <View style={styles.loadingFooter} />
    </Animated.View>
  );
}

export function ServicesLoadingView({
  backgroundColor,
  style,
  columns = 2,
  cardSize = 150,
  gap = 12,
  horizontalPadding = 12,
  topPadding = 0,
}: LoadingProps) {
  const count = Math.max(4, columns * 4);
  return (
    <View
      style={[
        styles.loadingShell,
        style,
        {
          backgroundColor,
          paddingTop: topPadding,
          paddingHorizontal: horizontalPadding,
        },
      ]}
    >
      <View style={[styles.loadingGrid, { gap }]}>
        {Array.from({ length: count }).map((_, index) => (
          <LoadingCard key={index} size={cardSize} />
        ))}
      </View>
    </View>
  );
}

export function ServicesErrorView({ backgroundColor, textColor, title, message, style }: ErrorProps) {
  return (
    <View style={[styles.shell, style, { backgroundColor }]}>
      <View style={styles.errorPanel}>
        <View style={styles.errorIconWrap}>
          <Ionicons name="warning-outline" size={20} color="#B45309" />
        </View>
        <View style={styles.errorBody}>
          <Text style={[styles.errorTitle, { color: textColor }]}>{title || 'Не удалось загрузить сервисы'}</Text>
          <Text style={styles.errorMessage}>{message || 'Проверьте соединение и обновите страницу.'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  loadingPanel: {
    width: '100%',
    maxWidth: 640,
    borderRadius: servicesTokens.shell.panelRadius,
    borderWidth: 1,
    borderColor: servicesTokens.shell.panelBorderColor,
    backgroundColor: servicesTokens.shell.panelBackground,
    padding: servicesTokens.shell.panelPadding,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  loadingSubtitle: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  loadingCard: {
    borderRadius: servicesTokens.card.radius,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: servicesTokens.card.paddingVertical,
    paddingHorizontal: servicesTokens.card.paddingHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  loadingIcon: {
    width: servicesTokens.card.iconContainerMaxSize,
    height: servicesTokens.card.iconContainerMaxSize,
    borderRadius: servicesTokens.card.iconRadius,
    backgroundColor: withOpacity('#2563EB', 0.1),
  },
  loadingTextBlock: {
    flex: 1,
    gap: 8,
  },
  loadingLineLg: {
    height: 14,
    borderRadius: 7,
    width: '56%',
    backgroundColor: '#E2E8F0',
  },
  loadingLineMd: {
    height: 12,
    borderRadius: 6,
    width: '92%',
    backgroundColor: '#EEF2F7',
  },
  loadingLineSm: {
    height: 12,
    borderRadius: 6,
    width: '68%',
    backgroundColor: '#EEF2F7',
  },
  loadingFooter: {
    height: 22,
    width: 22,
    borderRadius: 999,
    backgroundColor: '#E7EEF8',
  },
  loadingShell: {
    flex: 1,
    alignItems: 'center',
  },
  loadingGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingBottom: 110,
  },
  errorPanel: {
    width: '100%',
    maxWidth: 640,
    borderRadius: servicesTokens.shell.panelRadius,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBody: {
    flex: 1,
    gap: 3,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  errorMessage: {
    color: '#7C5A18',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
