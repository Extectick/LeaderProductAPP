import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useReducedMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  userName: string;
  updatedAt: string | null;
  onOpenServices: () => void;
};

function formatUpdatedAt(value: string | null): string {
  if (!value) return 'данные загружаются...';
  const date = new Date(value);
  if (Number.isNaN(+date)) return 'данные обновляются';
  return `обновлено ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function HomeHero({ userName, updatedAt, onOpenServices }: Props) {
  const float = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
    if (reducedMotion) return;
    float.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [float, reducedMotion]);

  const orbStyle = useAnimatedStyle(() => {
    const translateY = (float.value - 0.5) * 16;
    const translateX = (float.value - 0.5) * -8;
    return {
      transform: [{ translateY }, { translateX }],
    };
  });

  return (
    <Pressable
      onPress={onOpenServices}
      style={(state: any) => [
        styles.wrap,
        state.hovered ? styles.wrapHovered : null,
        state.pressed ? styles.wrapPressed : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Открыть сервисы"
    >
      <LinearGradient
        colors={['#0EA5E9', '#2563EB', '#4F46E5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={[styles.orb, orbStyle]} />
      <View style={styles.content}>
        <View style={styles.row}>
          <View style={styles.brandWrap}>
            <View style={styles.logoWrap}>
              <Image
                source={require('@/assets/images/icon.png')}
                style={styles.logo}
                contentFit="contain"
              />
            </View>
            <View>
              <Text style={styles.brandName}>Лидер Продукт</Text>
              <Text style={styles.brandSub}>Единый рабочий центр</Text>
            </View>
          </View>
          <Text style={styles.updatedAt}>{formatUpdatedAt(updatedAt)}</Text>
        </View>

        <Text style={styles.title}>Привет, {userName}</Text>
        <Text style={styles.subtitle}>
          Держите под рукой обращения, задачи и статистику сканов в реальном времени.
        </Text>

        <View style={styles.button}>
          <Ionicons name="apps-outline" size={16} color="#FFFFFF" />
          <Text style={styles.buttonText}>Открыть сервисы</Text>
          <Ionicons name="arrow-forward-outline" size={15} color="#FFFFFF" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 22,
    overflow: 'hidden',
    minHeight: 176,
    borderWidth: 1,
    borderColor: '#3B82F6',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    ...(Platform.OS === 'android' ? { elevation: 8 } : null),
  },
  wrapHovered: {
    borderColor: '#93C5FD',
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.3,
    shadowRadius: 24,
    ...(Platform.OS === 'android' ? { elevation: 12 } : null),
  },
  wrapPressed: {
    transform: [{ scale: 0.996 }],
  },
  orb: {
    position: 'absolute',
    right: -30,
    top: -26,
    width: 132,
    height: 132,
    borderRadius: 999,
    backgroundColor: '#FFFFFF33',
  },
  content: {
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  logoWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#FFFFFFE6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  logo: {
    width: 24,
    height: 24,
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  brandSub: {
    color: '#DBEAFE',
    fontSize: 11,
    fontWeight: '600',
  },
  updatedAt: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
  },
  subtitle: {
    color: '#E0E7FF',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 540,
  },
  button: {
    marginTop: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});
