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
};

type ErrorProps = {
  backgroundColor: string;
  textColor: string;
  message?: string | null;
  style?: any;
};

function LoadingCard({ index }: { index: number }) {
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
    <Animated.View style={[styles.loadingCard, shimmerStyle, { marginTop: index === 0 ? 0 : 10 }]}>
      <View style={styles.loadingIcon} />
      <View style={styles.loadingLineLg} />
      <View style={styles.loadingLineMd} />
      <View style={styles.loadingBadge} />
    </Animated.View>
  );
}

export function ServicesLoadingView({ backgroundColor, textColor, style }: LoadingProps) {
  return (
    <View style={[styles.shell, style, { backgroundColor }]}>
      <View style={styles.loadingPanel}>
        <Text style={[styles.loadingTitle, { color: textColor }]}>Загружаем сервисы</Text>
        <Text style={styles.loadingSubtitle}>Подготавливаем каталог и ваши доступы</Text>
        <LoadingCard index={0} />
        <LoadingCard index={1} />
        <LoadingCard index={2} />
      </View>
    </View>
  );
}

export function ServicesErrorView({ backgroundColor, textColor, message, style }: ErrorProps) {
  return (
    <View style={[styles.shell, style, { backgroundColor }]}>
      <View style={styles.errorPanel}>
        <View style={styles.errorIconWrap}>
          <Ionicons name="warning-outline" size={20} color="#B45309" />
        </View>
        <View style={styles.errorBody}>
          <Text style={[styles.errorTitle, { color: textColor }]}>Не удалось загрузить сервисы</Text>
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
    borderColor: '#D8E2F1',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8,
  },
  loadingIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withOpacity('#3B82F6', 0.18),
  },
  loadingLineLg: {
    height: 14,
    borderRadius: 7,
    width: '68%',
    backgroundColor: '#DEE8F8',
  },
  loadingLineMd: {
    height: 12,
    borderRadius: 6,
    width: '84%',
    backgroundColor: '#E5ECF9',
  },
  loadingBadge: {
    height: 28,
    width: 92,
    borderRadius: 999,
    backgroundColor: '#DFEAFE',
    marginTop: 4,
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
