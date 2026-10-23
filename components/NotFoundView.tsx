import React, { useRef } from 'react';
import { Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useReducedMotion } from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';

type Props = { onServices: () => void; onBack: () => void };
const actionBlue = '#0068D9'; // Accessible normal-size text on both light surfaces.

function Action({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();
  const animate = (value: number) => Animated.timing(scale, {
    toValue: reduceMotion ? 1 : value, duration: reduceMotion ? 0 : 110, useNativeDriver: true,
  }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable accessibilityRole="button" onPress={onPress}
        onPressIn={() => animate(0.98)} onPressOut={() => animate(1)}
        style={({ pressed }) => [styles.action, primary && styles.primary, pressed && styles.pressed]}>
        <Text style={[styles.actionText, primary && styles.primaryText]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Shared native/web fallback. No API or network dependency is needed to render it. */
export function NotFoundView({ onServices, onBack }: Props) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Вернуться назад" onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Навигация</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Image source={require('@/assets/images/page-not-found.png')} style={styles.illustration}
            resizeMode="contain" accessible={false} />
          <Text style={styles.code} accessible={false} accessibilityElementsHidden importantForAccessibility="no">404</Text>
          <Text accessibilityRole="header" style={styles.title}>{'Страница\nне найдена'}</Text>
          <Text style={styles.description}>Возможно, ссылка устарела или этот раздел больше недоступен.</Text>
          <View style={styles.actions}>
            <Action label="В сервисы" onPress={onServices} primary />
            <Action label="Назад" onPress={onBack} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.light.background },
  header: { width: '100%', maxWidth: 560, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 40 : 12, paddingBottom: 12 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EBEEF2', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: Colors.light.text, fontSize: 17, fontWeight: '500' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingTop: 28, paddingBottom: Platform.OS === 'web' ? 120 : 92 },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center', alignItems: 'center' },
  illustration: { width: 148, height: 148, marginBottom: 10, transform: [{ translateY: 8 }] },
  code: { color: '#9BA4B0', fontSize: 16, lineHeight: 22, fontWeight: '500', marginBottom: 10 },
  title: { color: Colors.light.text, fontSize: 28, lineHeight: 32, fontWeight: '700', textAlign: 'center' },
  description: { color: Colors.light.secondaryText, fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 260, marginTop: 16 },
  actions: { width: '100%', gap: 10, marginTop: 38 },
  action: { minHeight: 48, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  primary: { backgroundColor: actionBlue },
  actionText: { color: actionBlue, fontSize: 18, lineHeight: 24, fontWeight: '600', textAlign: 'center' },
  primaryText: { color: '#FFFFFF' },
  pressed: { opacity: 0.78 },
});
