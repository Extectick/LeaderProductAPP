import React from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import { Colors } from '@/constants/Colors';
import { ProfileView } from '@/components/Profile/ProfileView';
import { logoutUser } from '@/utils/authService';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

export default function ProfileScreen() {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {/* userId не передаём — покажется текущий профиль и блок действий будет скрыт */}
      <ProfileView />

      <LogoutButton />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function LogoutButton() {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[aStyle, { overflow: 'hidden', borderRadius: 12, alignItems: 'center', marginTop: 16 }]}>
      <Pressable
        onPressIn={() => (scale.value = withSpring(0.97, { damping: 18, stiffness: 260 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
        onPress={logoutUser}
        android_ripple={{ color: '#5B21B6' }}
        style={styles.logoutBtn}
      >
        <Ionicons name="log-out-outline" size={18} color="#fff" />
        <Text style={styles.logoutText}>Выйти из аккаунта</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.leaderprod.background },
  scrollContent: {
    padding: 16,
    ...Platform.select({ web: { maxWidth: 900, marginHorizontal: 'auto' }, default: {} }),
  },
  logoutBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutText: { color: '#fff', fontWeight: '800' },
});
