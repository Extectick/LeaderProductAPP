import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

/** Restores the original profile action, with the same spring and purple ripple. */
export function ProfileLogoutButton({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const animation = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }), [scale]);
  const animate = (value: number) => { scale.value = reducedMotion ? 1 : withSpring(value, { damping: 18, stiffness: 260 }); };
  return <Animated.View style={[animation, styles.shell]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Выйти из аккаунта" onPress={onPress}
      onPressIn={() => animate(0.97)} onPressOut={() => animate(1)} onHoverIn={() => animate(1.03)} onHoverOut={() => animate(1)}
      android_ripple={{ color: '#5B21B6' }} style={({ pressed }) => [styles.button, pressed && { backgroundColor: '#FEF2F2' }]}>
      <Ionicons name="log-out-outline" size={22} color="#B91C1C" />
      <Text style={styles.label}>Выйти из аккаунта</Text>
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  shell: { overflow: 'hidden', borderRadius: 12, alignItems: 'center' },
  button: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#FECACA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' },
  label: { color: '#B91C1C', fontWeight: '800', fontSize: 14 },
});
