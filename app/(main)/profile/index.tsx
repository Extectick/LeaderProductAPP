// V:\lp\app\(main)\profile\index.tsx
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, Platform, Alert } from 'react-native';
import { Colors } from '@/constants/Colors';
import { ProfileView } from '@/components/Profile/ProfileView';
import { logoutUser } from '@/utils/authService';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import CustomAlert from '@/components/CustomAlert';
import { useRouter, type Href } from 'expo-router';

export default function ProfileScreen() {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <ProfileView />
      <LogoutButton />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function LogoutButton() {
  const [confirmVisible, setConfirmVisible] = useState(false); // используется только на web
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const router = useRouter();

  const signOut = useCallback(async () => {
    try {
      await logoutUser(); // серверный logout (опционально) + очистка токенов
    } finally {
      router.replace('/(auth)/AuthScreen' as Href);
    }
  }, [router]);

  const openConfirm = () => {
    if (Platform.OS === 'web') {
      // web — показываем кастомное модальное окно
      setConfirmVisible(true);
    } else {
      // iOS/Android — используем системный Alert (всегда поверх и без роутов)
      Alert.alert(
        'Выйти из аккаунта?',
        'Вы действительно хотите выйти из аккаунта?',
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Выйти', style: 'destructive', onPress: () => void signOut() },
        ],
        { cancelable: true }
      );
    }
  };

  return (
    <>
      <Animated.View
        style={[aStyle, { overflow: 'hidden', borderRadius: 12, alignItems: 'center', marginTop: 16 }]}
      >
        <Pressable
          onPressIn={() => (scale.value = withSpring(0.97, { damping: 18, stiffness: 260 }))}
          onPressOut={() => (scale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
          onPress={openConfirm}
          android_ripple={{ color: '#5B21B6' }}
          style={styles.logoutBtn}
        >
          <Ionicons name="log-out-outline" size={18} color="#fff" />
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </Pressable>
      </Animated.View>

      {/* Кастомная модалка нужна только для web */}
      {Platform.OS === 'web' && (
        <CustomAlert
          visible={confirmVisible}
          title="Выйти из аккаунта?"
          message="Вы действительно хотите выйти из аккаунта?"
          cancelText="Отмена"
          confirmText="Выйти"
          onCancel={() => setConfirmVisible(false)}
          onConfirm={() => {
            setConfirmVisible(false);
            void signOut();
          }}
        />
      )}
    </>
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
