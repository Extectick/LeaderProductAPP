import BrandedBackground from '@/components/BrandedBackground';
import ShimmerButton from '@/components/ShimmerButton';
import { gradientColors, ThemeKey } from '@/constants/Colors';
import { AuthContext } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { getProfileGate } from '@/utils/profileGate';
import { getProfile } from '@/utils/userService';
import { useRouter, type RelativePathString } from 'expo-router';
import React, { useContext, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CustomAlert from '@/components/CustomAlert';

export default function ProfileBlockedScreen() {
  const router = useRouter();
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext is required');
  const { signOut, setProfile, profile } = auth;

  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const grad = gradientColors[theme as ThemeKey] || gradientColors.light;
  const btnGradient: [string, string] = [grad[0], grad[1]];
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [checking, setChecking] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const blockedByUser = profile?.profileStatus === 'BLOCKED';

  const handleRefresh = async () => {
    setChecking(true);
    try {
      const fresh = await getProfile();
      if (fresh) await setProfile(fresh);
      const nextGate = getProfileGate(fresh);
      if (nextGate === 'active') {
        router.replace('/home' as RelativePathString);
      } else if (nextGate === 'pending') {
        router.replace('/(auth)/ProfilePendingScreen' as RelativePathString);
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось обновить статус');
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.replace('/(auth)/AuthScreen' as RelativePathString);
  };

  const openConfirm = () => setConfirmVisible(true);

  return (
    <BrandedBackground speed={1.2}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="account-cancel-outline" size={30} color={colors.error} />
          </View>
          <Text style={styles.title}>Доступ ограничен</Text>
          <Text style={styles.subtitle}>
            {blockedByUser
              ? 'Ваш аккаунт заблокирован. Обратитесь к администратору для восстановления доступа.'
              : 'Выбранный профиль заблокирован. Вы можете переключиться на другой профиль или выйти.'}
          </Text>

          <View style={styles.actions}>
            <ShimmerButton
              title={checking ? 'Проверяем...' : 'Проверить статус'}
              loading={checking}
              gradientColors={btnGradient}
              onPress={handleRefresh}
            />
            <TouchableOpacity style={styles.logoutBtn} onPress={openConfirm} activeOpacity={0.85}>
              <Text style={styles.logoutText}>Выйти</Text>
            </TouchableOpacity>
          </View>
        </View>

        <CustomAlert
          visible={confirmVisible}
          title="Выйти из аккаунта?"
          message="Вы действительно хотите выйти из аккаунта?"
          cancelText="Отмена"
          confirmText="Выйти"
          onCancel={() => setConfirmVisible(false)}
          onConfirm={() => {
            setConfirmVisible(false);
            void handleLogout();
          }}
        />
      </SafeAreaView>
    </BrandedBackground>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    card: {
      width: '100%',
      maxWidth: 460,
      backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.88)' : colors.cardBackground,
      borderRadius: 20,
      padding: 22,
      alignItems: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.18,
          shadowRadius: 16,
        },
        android: { elevation: 8 },
        web: { backdropFilter: 'blur(10px)', boxShadow: '0px 12px 24px rgba(0,0,0,0.15)' },
      }),
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.error}1F`,
      marginBottom: 12,
    },
    title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 6 },
    subtitle: { fontSize: 14, color: colors.secondaryText, textAlign: 'center', marginBottom: 16 },
    actions: { width: '100%', gap: 10 },
    secondaryBtn: {
      height: 46,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inputBackground,
    },
    secondaryText: { fontSize: 15, fontWeight: '700', color: colors.text },
    logoutBtn: {
      height: 46,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.error,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.error}12`,
    },
    logoutText: { fontSize: 15, fontWeight: '800', color: colors.error },
  });
