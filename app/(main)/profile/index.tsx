// V:\lp\app\(main)\profile\index.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';
import { ProfileView } from '@/components/Profile/ProfileView';
import { logoutUser } from '@/utils/authService';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import CustomAlert from '@/components/CustomAlert';
import { useRouter, type Href } from 'expo-router';
import { getProfile, updateMyProfile, type UpdateMyProfilePayload } from '@/utils/userService';
import type { Profile } from '@/types/userTypes';
import { useTracking } from '@/context/TrackingContext';
import { Skeleton } from 'moti/skeleton';
import { mask, MaskedTextInput, unMask } from 'react-native-mask-text';

const PROFILE_CACHE_KEY = 'profile';
const PHONE_MASK = '+7 (999) 999-99-99';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profileRef = useRef<Profile | null>(null);

  const hydrateFromCache = useCallback(async () => {
    try {
      const cachedRaw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
      if (!cachedRaw) return;
      const cached = JSON.parse(cachedRaw) as Profile;
      setProfile(cached);
      setLoading(false);
    } catch {
      // игнорируем ошибку кэша
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const fresh = await getProfile();
      if (fresh) {
        setProfile(fresh);
      } else if (!profileRef.current) {
        setError('Не удалось загрузить профиль');
      }
    } catch (e: any) {
      if (!profileRef.current) setError(e?.message || 'Не удалось загрузить профиль');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    void hydrateFromCache();
    void refreshProfile();
  }, [hydrateFromCache, refreshProfile]);

  if (!loading && !profile) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <RefreshButton onPress={refreshProfile} loading={refreshing} />
        <LogoutButton />
        <View style={{ height: 24 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <ProfileView profileOverride={profile} loadingOverride={loading} errorOverride={error} />
      {loading && !profile ? (
        <ProfileEditorSkeleton />
      ) : (
        <ProfileEditor
          profile={profile}
          loading={loading}
          refreshing={refreshing}
          onProfileUpdated={(next) => {
            setProfile(next);
            setError(null);
          }}
        />
      )}
      {loading && !profile ? <TrackingSkeleton /> : <TrackingToggle />}
      {loading && !profile ? <LogoutSkeleton /> : <LogoutButton />}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

type ProfileForm = {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phone: string;
};

const normalizePhone = (value?: string | null) => (value ? unMask(value) : '');

const buildProfileForm = (profile: Profile | null): ProfileForm => ({
  firstName: profile?.firstName || '',
  lastName: profile?.lastName || '',
  middleName: profile?.middleName || '',
  email: profile?.email || '',
  phone: normalizePhone(profile?.phone || profile?.employeeProfile?.phone || ''),
});

function ProfileEditor({
  profile,
  loading,
  refreshing,
  onProfileUpdated,
}: {
  profile: Profile | null;
  loading: boolean;
  refreshing: boolean;
  onProfileUpdated: (next: Profile) => void;
}) {
  if (loading && !profile) {
    return <ProfileEditorSkeleton />;
  }

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileForm>(() => buildProfileForm(profile));
  const saveScale = useSharedValue(1);
  const cancelScale = useSharedValue(1);
  const saveStyle = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));
  const cancelStyle = useAnimatedStyle(() => ({ transform: [{ scale: cancelScale.value }] }));

  const baseline = useMemo(
    () => ({
      firstName: profile?.firstName || '',
      lastName: profile?.lastName || '',
      middleName: profile?.middleName || '',
      email: profile?.email || '',
      phone: normalizePhone(profile?.phone || profile?.employeeProfile?.phone || ''),
    }),
    [profile]
  );

  const dirty = useMemo(() => {
    const trim = (val: string) => val.trim();
    return (
      trim(form.firstName) !== trim(baseline.firstName) ||
      trim(form.lastName) !== trim(baseline.lastName) ||
      trim(form.middleName) !== trim(baseline.middleName) ||
      trim(form.email) !== trim(baseline.email) ||
      form.phone !== baseline.phone
    );
  }, [baseline, form]);

  const phoneDigits = form.phone;
  const baselinePhoneDigits = baseline.phone;
  const phoneValid = phoneDigits.length === 0 || (phoneDigits.length === 11 && phoneDigits.startsWith('7'));
  const emailValue = form.email.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
  const emailError = emailValue.length === 0 ? 'Email обязателен' : emailValid ? null : 'Некорректный email';
  const phoneError = phoneDigits.length > 0 && !phoneValid ? 'Неверный номер телефона' : null;

  useEffect(() => {
    if (!editing) setForm(buildProfileForm(profile));
  }, [editing, profile]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!profile) return;
    const email = form.email.trim();
    if (!emailValid) {
      Alert.alert('Ошибка', emailError || 'Введите корректный email');
      return;
    }
    if (!phoneValid) {
      Alert.alert('Ошибка', phoneError || 'Неверный номер телефона');
      return;
    }

    const payload: UpdateMyProfilePayload = {};
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const middleName = form.middleName.trim();
    const phone = form.phone.trim();

    if (firstName !== baseline.firstName) payload.firstName = firstName || null;
    if (lastName !== baseline.lastName) payload.lastName = lastName || null;
    if (middleName !== baseline.middleName) payload.middleName = middleName || null;
    if (email !== baseline.email) payload.email = email;
    if (phoneDigits !== baselinePhoneDigits) payload.phone = phone ? mask(phone, PHONE_MASK) : null;

    if (!Object.keys(payload).length) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMyProfile(payload);
      if (updated) {
        onProfileUpdated(updated);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setEditing(false);
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось обновить профиль');
    } finally {
      setSaving(false);
    }
  }, [
    baseline,
    baselinePhoneDigits,
    emailError,
    emailValid,
    form,
    onProfileUpdated,
    phoneDigits,
    phoneError,
    phoneValid,
    profile,
  ]);

  const handleCancel = useCallback(() => {
    setForm(buildProfileForm(profile));
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditing(false);
  }, [profile]);

  return (
    <View style={styles.editCard}>
      <View style={styles.editHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.editTitle}>Данные профиля</Text>
          <Text style={styles.editSubtitle}>
            {refreshing ? 'Синхронизация...' : 'Измените телефон, почту и ФИО'}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setEditing((prev) => !prev);
          }}
          style={({ pressed }) => [styles.editToggle, pressed && styles.editTogglePressed]}
          android_ripple={{ color: '#E0E7FF' }}
        >
          <Ionicons name={editing ? 'close-outline' : 'create-outline'} size={16} color={Colors.leaderprod.tint} />
          <Text style={styles.editToggleText}>{editing ? 'Отмена' : 'Изменить'}</Text>
        </Pressable>
      </View>

      {!profile ? (
        <Text style={styles.editHint}>Профиль не загружен</Text>
      ) : editing ? (
        <View style={styles.editForm}>
          <View style={styles.fieldRow}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Имя</Text>
              <TextInput
                value={form.firstName}
                onChangeText={(val) => setForm((prev) => ({ ...prev, firstName: val }))}
                style={styles.fieldInput}
                placeholder="Введите имя"
                autoCapitalize="words"
              />
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Фамилия</Text>
              <TextInput
                value={form.lastName}
                onChangeText={(val) => setForm((prev) => ({ ...prev, lastName: val }))}
                style={styles.fieldInput}
                placeholder="Введите фамилию"
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Отчество</Text>
              <TextInput
                value={form.middleName}
                onChangeText={(val) => setForm((prev) => ({ ...prev, middleName: val }))}
                style={styles.fieldInput}
                placeholder="Необязательно"
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                value={form.email}
                onChangeText={(val) =>
                  setForm((prev) => ({ ...prev, email: val.replace(/\s+/g, '') }))
                }
                style={[styles.fieldInput, emailError && styles.fieldInputError]}
                placeholder="example@mail.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              {emailError ? <Text style={styles.fieldErrorText}>{emailError}</Text> : null}
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Телефон</Text>
              <MaskedTextInput
                value={form.phone}
                onChangeText={(_, raw) =>
                  setForm((prev) => {
                    const next = raw ?? '';
                    return prev.phone === next ? prev : { ...prev, phone: next };
                  })
                }
                style={[styles.fieldInput, phoneError && styles.fieldInputError]}
                placeholder="+7 (___) ___-__-__"
                keyboardType="phone-pad"
                autoCorrect={false}
                mask={PHONE_MASK}
              />
              {phoneError ? <Text style={styles.fieldErrorText}>{phoneError}</Text> : null}
            </View>
          </View>

          <View style={styles.editActions}>
            <Animated.View style={[saveStyle, { flex: 1 }]}>
              <Pressable
                onPressIn={() => (saveScale.value = withSpring(0.97, { damping: 18, stiffness: 260 }))}
                onPressOut={() => (saveScale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
                onPress={handleSave}
                disabled={saving || !dirty || !emailValid || !phoneValid}
                android_ripple={{ color: '#FCD34D' }}
                style={({ pressed }) => [
                  styles.saveBtn,
                  (!dirty || saving || !emailValid || !phoneValid) && styles.saveBtnDisabled,
                  pressed && styles.saveBtnPressed,
                ]}
              >
                <Ionicons name="checkmark-outline" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>{saving ? 'Сохранение...' : 'Сохранить'}</Text>
              </Pressable>
            </Animated.View>
            <Animated.View style={[cancelStyle, { flex: 0.6 }]}>
              <Pressable
                onPressIn={() => (cancelScale.value = withSpring(0.97, { damping: 18, stiffness: 260 }))}
                onPressOut={() => (cancelScale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
                onPress={handleCancel}
                disabled={saving}
                android_ripple={{ color: '#E5E7EB' }}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  saving && styles.cancelBtnDisabled,
                  pressed && styles.cancelBtnPressed,
                ]}
              >
                <Text style={styles.cancelBtnText}>Сбросить</Text>
              </Pressable>
            </Animated.View>
          </View>
        </View>
      ) : (
        <Text style={styles.editHint}>Нажмите "Изменить", чтобы обновить профиль.</Text>
      )}
    </View>
  );
}

function ProfileEditorSkeleton() {
  return (
    <View style={styles.editCard}>
      <View style={{ gap: 8 }}>
        <Skeleton height={16} width="45%" radius={6} colorMode="light" />
        <Skeleton height={12} width="70%" radius={6} colorMode="light" />
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.fieldBlock}>
          <Skeleton height={42} radius={10} colorMode="light" />
        </View>
        <View style={styles.fieldBlock}>
          <Skeleton height={42} radius={10} colorMode="light" />
        </View>
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.fieldBlock}>
          <Skeleton height={42} radius={10} colorMode="light" />
        </View>
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.fieldBlock}>
          <Skeleton height={42} radius={10} colorMode="light" />
        </View>
        <View style={styles.fieldBlock}>
          <Skeleton height={42} radius={10} colorMode="light" />
        </View>
      </View>
      <View style={styles.editActions}>
        <Skeleton height={44} radius={12} colorMode="light" width="60%" />
        <Skeleton height={44} radius={12} colorMode="light" width="35%" />
      </View>
    </View>
  );
}

function TrackingSkeleton() {
  return (
    <View style={styles.trackingRow}>
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton height={14} width="55%" radius={6} colorMode="light" />
        <Skeleton height={12} width="80%" radius={6} colorMode="light" />
      </View>
      <Skeleton height={26} width={46} radius={13} colorMode="light" />
    </View>
  );
}

function LogoutSkeleton() {
  return (
    <View style={styles.logoutSkeleton}>
      <Skeleton height={44} width="100%" radius={12} colorMode="light" />
    </View>
  );
}

function RefreshButton({ onPress, loading }: { onPress: () => void; loading: boolean }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[aStyle, { overflow: 'hidden', borderRadius: 12, alignItems: 'center', marginTop: 16 }]}
    >
      <Pressable
        onPressIn={() => (scale.value = withSpring(0.97, { damping: 18, stiffness: 260 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
        onPress={onPress}
        disabled={loading}
        android_ripple={{ color: '#FCD34D' }}
        style={({ pressed }) => [
          styles.refreshBtn,
          pressed && Platform.OS === 'ios' ? { opacity: 0.9 } : null,
          loading && styles.refreshBtnDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Ionicons name="refresh-outline" size={18} color="#fff" />
        )}
        <Text style={styles.refreshText}>Обновить профиль</Text>
      </Pressable>
    </Animated.View>
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

function TrackingToggle() {
  const { trackingEnabled, startTracking, stopTracking } = useTracking();
  const [loading, setLoading] = useState(false);

  const onToggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (trackingEnabled) {
        await stopTracking();
      } else {
        await startTracking();
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message ?? 'Не удалось изменить состояние трекинга');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.trackingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.trackingTitle}>Отслеживание маршрута</Text>
        <Text style={styles.trackingSubtitle}>
          При включении приложение будет отправлять координаты в фоне.
        </Text>
      </View>
      <Switch value={trackingEnabled} onValueChange={onToggle} disabled={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.leaderprod.background },
  scrollContent: {
    padding: 16,
    ...Platform.select({ web: { maxWidth: 900, marginHorizontal: 'auto' }, default: {} }),
  },
  trackingRow: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trackingTitle: { fontWeight: '600', fontSize: 16, marginBottom: 4 },
  trackingSubtitle: { fontSize: 12, color: '#4B5563' },
  logoutSkeleton: { marginTop: 16 },
  refreshBtn: {
    backgroundColor: Colors.leaderprod.button,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  refreshBtnDisabled: { backgroundColor: Colors.leaderprod.buttonDisabled },
  refreshText: { color: '#fff', fontWeight: '800' },
  editCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  editHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  editSubtitle: { fontSize: 12, color: '#64748B', marginTop: 4 },
  editToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FBD38D',
    backgroundColor: '#FFF7E6',
  },
  editTogglePressed: { backgroundColor: '#FFE8C2' },
  editToggleText: { fontWeight: '700', color: Colors.leaderprod.tint },
  editHint: { color: '#6B7280' },
  editForm: { gap: 10 },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fieldBlock: { flex: 1, minWidth: 160, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  fieldInput: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
  },
  fieldInputError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  fieldErrorText: { color: '#DC2626', fontSize: 12, fontWeight: '600' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  saveBtn: {
    backgroundColor: Colors.leaderprod.button,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnPressed: { backgroundColor: '#F59E0B' },
  saveBtnDisabled: { backgroundColor: Colors.leaderprod.buttonDisabled },
  saveBtnText: { color: '#fff', fontWeight: '800' },
  cancelBtn: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnPressed: { backgroundColor: '#E5E7EB' },
  cancelBtnDisabled: { opacity: 0.6 },
  cancelBtnText: { color: '#111827', fontWeight: '700' },
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
