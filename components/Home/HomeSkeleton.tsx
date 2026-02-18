import React from 'react';
import { DimensionValue, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type SkeletonBlockProps = {
  height: number;
  width?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonBlock({ height, width = '100%', radius = 12, style }: SkeletonBlockProps) {
  const opacity = useSharedValue(0.38);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.82, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      <View style={[styles.block, { height, width, borderRadius: radius }]} />
    </Animated.View>
  );
}

export function HomeDashboardSkeleton() {
  return (
    <View style={styles.wrap}>
      <SkeletonBlock height={182} radius={22} />
      <View style={styles.row}>
        <SkeletonBlock height={108} style={styles.card} />
        <SkeletonBlock height={108} style={styles.card} />
      </View>
      <View style={styles.row}>
        <SkeletonBlock height={108} style={styles.card} />
        <SkeletonBlock height={108} style={styles.card} />
      </View>
      <SkeletonBlock height={216} radius={16} />
      <SkeletonBlock height={264} radius={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
  },
  block: {
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
});
