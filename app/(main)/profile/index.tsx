// V:\lp\app\(main)\profile\index.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';
import { ProfileView } from '@/components/Profile/ProfileView';
import { addCredentials, logoutUser, resendVerification, verify } from '@/utils/authService';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import CustomAlert from '@/components/CustomAlert';
import { useRouter, type Href } from 'expo-router';
import {
  cancelPhoneVerification,
  getPhoneVerificationStatus,
  getProfile,
  startPhoneVerification,
  updateMyProfile,
  type UpdateMyProfilePayload,
} from '@/utils/userService';
import type { Profile } from '@/src/entities/user/types';
import { useTracking } from '@/context/TrackingContext';
import { NotificationSettingsSection } from '@/components/Profile/NotificationSettingsSection';
import { Skeleton } from 'moti/skeleton';
import { shadeColor } from '@/utils/color';
import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import QRCode from 'react-native-qrcode-svg';
import { formatPhoneDisplay, formatPhoneInputMask, normalizePhoneInputToDigits11, toApiPhoneDigitsString } from '@/utils/phone';
import {
  isValidEmail,
  isValidPhoneVerificationDeepLink,
  mapPhoneVerificationReason,
  openPhoneVerificationDeepLink,
  providerLabel,
  resolvePreferredPhoneProvider,
  type PhoneVerificationProvider,
} from '@/src/features/profile/lib/verification';

const PROFILE_CACHE_KEY = 'profile';

export default function ProfileScreen() {
  const headerTopInset = useHeaderContentTopInset();
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
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: 16 + headerTopInset }]}>
        <RefreshButton onPress={refreshProfile} loading={refreshing} />
        <LogoutButton />
        <TabBarSpacer />
      </ScrollView>
    );
  }

  if (loading && !profile) {
    return (
      <View style={[styles.loaderWrap, { paddingTop: 16 + headerTopInset }]}>
        <View style={styles.loaderCard}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.loaderText}>Загрузка профиля...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: 16 + headerTopInset }]}>
      <ProfileView
        profileOverride={profile}
        loadingOverride={loading}
        errorOverride={error}
        disableAppearAnimation
        onProfileUpdated={(next) => {
          setProfile(next);
          setError(null);
        }}
      />
      {loading && !profile ? null : (
        <CredentialsSection
          profile={profile}
          onAdded={refreshProfile}
        />
      )}
      {loading && !profile ? <TrackingSkeleton /> : <TrackingToggle />}
      {loading && !profile ? null : <NotificationSettingsSection />}
      {loading && !profile ? <LogoutSkeleton /> : <LogoutButton />}
      <TabBarSpacer />
    </ScrollView>
  );
}

type ProfileForm = {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
};

const normalizePhone = (value?: string | null) => normalizePhoneInputToDigits11(value || '') || '';
const toMaskedPhone = (value?: string | null) => formatPhoneInputMask(value || '');

const buildProfileForm = (profile: Profile | null): ProfileForm => ({
  firstName: profile?.firstName || '',
  lastName: profile?.lastName || '',
  middleName: profile?.middleName || '',
  email: profile?.email || '',
});

type CredentialsStep = 'credentials' | 'verify';

type ResolvedAuthMethods = {
  telegramLinked: boolean;
  maxLinked: boolean;
  passwordLoginEnabled: boolean;
  passwordLoginPendingVerification: boolean;
};

function resolveAuthMethods(profile: Profile | null): ResolvedAuthMethods {
  const fromApi = profile?.authMethods;
  if (fromApi) {
    return {
      telegramLinked: Boolean(fromApi.telegramLinked),
      maxLinked: Boolean(fromApi.maxLinked),
      passwordLoginEnabled: Boolean(fromApi.passwordLoginEnabled),
      passwordLoginPendingVerification: Boolean(fromApi.passwordLoginPendingVerification),
    };
  }

  return {
    telegramLinked: Boolean(profile?.telegramId),
    maxLinked: Boolean(profile?.maxId),
    passwordLoginEnabled: false,
    passwordLoginPendingVerification: false,
  };
}


function CredentialsSection({
  profile,
  onAdded,
}: {
  profile: Profile | null;
  onAdded: () => Promise<void>;
}) {
  const authMethods = resolveAuthMethods(profile);
  const shouldShowSetup = (authMethods.telegramLinked || authMethods.maxLinked) && !authMethods.passwordLoginEnabled;
  const emailFromProfile = (profile?.email || '').trim().toLowerCase();

  const [step, setStep] = useState<CredentialsStep>('credentials');
  const [showCompletion, setShowCompletion] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    if (authMethods.passwordLoginPendingVerification && emailFromProfile) {
      setShowCompletion(false);
      setStep('verify');
      setEmail(emailFromProfile);
      return;
    }

    setShowCompletion(false);
    setStep('credentials');
  }, [
    profile,
    emailFromProfile,
    authMethods.passwordLoginEnabled,
    authMethods.passwordLoginPendingVerification,
  ]);

  if (!profile || (!shouldShowSetup && !showCompletion)) return null;

  const normalizedEmail = email.trim().toLowerCase();
  const verificationEmail = emailFromProfile || normalizedEmail;
  const emailValid = isValidEmail(normalizedEmail);
  const passwordValid = password.trim().length >= 6;
  const codeValid = /^\d{6}$/.test(code.trim());

  const onSubmitCredentials = async () => {
    if (!emailValid || !passwordValid) {
      Alert.alert('Ошибка', 'Укажите корректный email и пароль не менее 6 символов');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await addCredentials(normalizedEmail, password.trim());
      setNotice('Email и пароль сохранены. Введите код из письма.');
      setStep('verify');
      setEmail(normalizedEmail);
      setPassword('');
      await onAdded();
    } catch (e: any) {
      setError(e?.message || 'Не удалось добавить email и пароль');
    } finally {
      setSaving(false);
    }
  };

  const onSubmitVerification = async () => {
    if (!verificationEmail || !isValidEmail(verificationEmail)) {
      setError('Не удалось определить email для подтверждения');
      return;
    }
    if (!codeValid) {
      setError('Введите 6-значный код из письма');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await verify(verificationEmail, code.trim());
      await onAdded();
      setCode('');
      setShowCompletion(true);
      setNotice('Вход по email/паролю активирован.');
    } catch (e: any) {
      setError(e?.message || 'Не удалось подтвердить email');
    } finally {
      setSaving(false);
    }
  };

  const onResendCode = async () => {
    if (!verificationEmail || !isValidEmail(verificationEmail)) {
      setError('Не удалось определить email для повторной отправки');
      return;
    }
    setResending(true);
    setError(null);
    try {
      await resendVerification(verificationEmail);
      setNotice('Код подтверждения отправлен повторно.');
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить код повторно');
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.credentialsCard}>
      <Text style={styles.credentialsTitle}>Вход по email и паролю</Text>
      <Text style={styles.credentialsSubtitle}>
        Для этого Telegram-аккаунта можно добавить резервный способ входа.
      </Text>
      {error ? <Text style={styles.credentialsError}>{error}</Text> : null}
      {notice ? <Text style={styles.credentialsNotice}>{notice}</Text> : null}

      {!showCompletion && shouldShowSetup && step === 'credentials' ? (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            style={styles.fieldInput}
            placeholder="example@mail.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={styles.fieldInput}
            placeholder="Пароль"
            secureTextEntry
          />
          <Pressable
            onPress={onSubmitCredentials}
            disabled={saving}
            style={({ pressed }) => [
              styles.credentialsButton,
              saving && styles.credentialsButtonDisabled,
              pressed && !saving ? styles.credentialsButtonPressed : null,
            ]}
          >
            <Text style={styles.credentialsButtonText}>
              {saving ? 'Сохранение...' : 'Добавить email и пароль'}
            </Text>
          </Pressable>
        </>
      ) : null}

      {!showCompletion && shouldShowSetup && step === 'verify' ? (
        <>
          <Text style={styles.credentialsHint}>
            Подтвердите email {verificationEmail || '—'} кодом из письма.
          </Text>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D+/g, '').slice(0, 6))}
            style={styles.fieldInput}
            placeholder="Код из 6 цифр"
            keyboardType="number-pad"
          />
          <Pressable
            onPress={onSubmitVerification}
            disabled={saving}
            style={({ pressed }) => [
              styles.credentialsButton,
              saving && styles.credentialsButtonDisabled,
              pressed && !saving ? styles.credentialsButtonPressed : null,
            ]}
          >
            <Text style={styles.credentialsButtonText}>
              {saving ? 'Проверка...' : 'Подтвердить email'}
            </Text>
          </Pressable>
          <Pressable
            onPress={onResendCode}
            disabled={resending || saving}
            style={({ pressed }) => [
              styles.credentialsSecondaryButton,
              (resending || saving) && styles.credentialsButtonDisabled,
              pressed && !(resending || saving) ? styles.credentialsSecondaryButtonPressed : null,
            ]}
          >
            <Text style={styles.credentialsSecondaryButtonText}>
              {resending ? 'Отправка...' : 'Отправить код повторно'}
            </Text>
          </Pressable>
        </>
      ) : null}

      {showCompletion ? (
        <View style={styles.credentialsDoneWrap}>
          <Text style={styles.credentialsDoneText}>Вход по email/паролю активирован.</Text>
        </View>
      ) : null}
    </View>
  );
}

function ProfileEditor({
  profile,
  loading,
  refreshing,
  phoneActionNonce,
  onRefreshProfile,
  onProfileUpdated,
}: {
  profile: Profile | null;
  loading: boolean;
  refreshing: boolean;
  phoneActionNonce: number;
  onRefreshProfile: () => Promise<void>;
  onProfileUpdated: (next: Profile) => void;
}) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 768;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileForm>(() => buildProfileForm(profile));
  const [phoneMode, setPhoneMode] = useState<'collapsed' | 'editing' | 'pending'>('collapsed');
  const [phoneInput, setPhoneInput] = useState(toMaskedPhone(profile?.phone || ''));
  const [phoneSessionId, setPhoneSessionId] = useState<string | null>(null);
  const [phoneDeepLinkUrl, setPhoneDeepLinkUrl] = useState('');
  const [phoneQrPayload, setPhoneQrPayload] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneStatusText, setPhoneStatusText] = useState<string | null>(null);
  const lastPhoneActionNonceRef = useRef(phoneActionNonce);

  const toggleScale = useSharedValue(1);
  const saveScale = useSharedValue(1);
  const cancelScale = useSharedValue(1);
  const toggleStyle = useAnimatedStyle(() => ({ transform: [{ scale: toggleScale.value }] }));
  const saveStyle = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));
  const cancelStyle = useAnimatedStyle(() => ({ transform: [{ scale: cancelScale.value }] }));

  const profilePhoneDigits = normalizePhone(profile?.phone || '');
  const profilePhoneMasked = toMaskedPhone(profilePhoneDigits);
  const phoneVerified = Boolean(profilePhoneDigits && profile?.phoneVerifiedAt);
  const hasPhone = Boolean(profilePhoneDigits);
  const displayedPhone = profilePhoneDigits ? formatPhoneDisplay(profilePhoneDigits) : '';
  const preferredPhoneProvider = resolvePreferredPhoneProvider(profile);
  const preferredProviderLabel = providerLabel(preferredPhoneProvider);

  const baseline = useMemo(
    () => ({
      firstName: profile?.firstName || '',
      lastName: profile?.lastName || '',
      middleName: profile?.middleName || '',
      email: profile?.email || '',
    }),
    [profile]
  );

  const dirty = useMemo(() => {
    const trim = (val: string) => val.trim();
    return (
      trim(form.firstName) !== trim(baseline.firstName) ||
      trim(form.lastName) !== trim(baseline.lastName) ||
      trim(form.middleName) !== trim(baseline.middleName) ||
      trim(form.email) !== trim(baseline.email)
    );
  }, [baseline, form]);

  const emailValue = form.email.trim();
  const emailValid = isValidEmail(emailValue);
  const emailError = emailValue.length === 0 ? 'Email обязателен' : emailValid ? null : 'Некорректный email';

  const clearPhoneSessionState = useCallback(() => {
    setPhoneSessionId(null);
    setPhoneDeepLinkUrl('');
    setPhoneQrPayload('');
  }, []);

  useEffect(() => {
    if (!editing) {
      setForm(buildProfileForm(profile));
      setPhoneMode('collapsed');
      setPhoneInput(profilePhoneMasked);
      setPhoneError(null);
      setPhoneStatusText(null);
      clearPhoneSessionState();
      return;
    }
    if (phoneMode !== 'pending') {
      setPhoneInput(profilePhoneMasked);
    }
  }, [clearPhoneSessionState, editing, phoneMode, profile, profilePhoneMasked]);

  useEffect(() => {
    const isTurboModuleEnabled = Boolean((globalThis as any).__turboModuleProxy);
    if (
      Platform.OS === 'android' &&
      !isTurboModuleEnabled &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (lastPhoneActionNonceRef.current === phoneActionNonce) return;
    lastPhoneActionNonceRef.current = phoneActionNonce;
    if (!profile || phoneMode === 'pending') return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditing(true);
    setPhoneMode('editing');
    setPhoneInput(profilePhoneMasked);
    setPhoneError(null);
    setPhoneStatusText(null);
  }, [phoneActionNonce, phoneMode, profile, profilePhoneMasked]);

  const checkPhoneSessionStatus = useCallback(
    async (activeSessionId: string) => {
      const session = await getPhoneVerificationStatus(activeSessionId);
      if (session.status === 'PENDING') return;

      if (session.status === 'VERIFIED') {
        setPhoneStatusText(null);
        clearPhoneSessionState();
        setPhoneMode('collapsed');
        await onRefreshProfile();
        return;
      }

      clearPhoneSessionState();
      setPhoneMode('editing');

      if (session.status === 'FAILED') {
        setPhoneError(mapPhoneVerificationReason(session.failureReason, resolvePreferredPhoneProvider(profile)));
        return;
      }
      if (session.status === 'EXPIRED') {
        setPhoneError('Сессия подтверждения истекла. Запустите подтверждение снова.');
        return;
      }
      if (session.status === 'CANCELLED') {
        setPhoneStatusText('Привязка отменена');
      }
    },
    [clearPhoneSessionState, onRefreshProfile]
  );

  useEffect(() => {
    if (phoneMode !== 'pending' || !phoneSessionId) return;

    const timer = setInterval(() => {
      void checkPhoneSessionStatus(phoneSessionId).catch((e: any) => {
        setPhoneError(e?.message || 'Не удалось проверить статус подтверждения');
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [checkPhoneSessionStatus, phoneMode, phoneSessionId]);

  useEffect(() => {
    if (phoneMode !== 'pending' || !phoneSessionId) return;

    const handleForeground = () => {
      void checkPhoneSessionStatus(phoneSessionId).catch((e: any) => {
        setPhoneError(e?.message || 'Не удалось проверить статус подтверждения');
      });
    };

    if (Platform.OS === 'web') {
      const onVisibility = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          handleForeground();
        }
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleForeground);
      }
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibility);
      }
      return () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('focus', handleForeground);
        }
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibility);
        }
      };
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        handleForeground();
      }
    });
    return () => subscription.remove();
  }, [checkPhoneSessionStatus, phoneMode, phoneSessionId]);

  const handleSave = useCallback(async () => {
    if (!profile) return;
    const email = form.email.trim();
    if (!emailValid) {
      Alert.alert('Ошибка', emailError || 'Введите корректный email');
      return;
    }
    const payload: UpdateMyProfilePayload = {};
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const middleName = form.middleName.trim();

    if (firstName !== baseline.firstName) payload.firstName = firstName || null;
    if (lastName !== baseline.lastName) payload.lastName = lastName || null;
    if (middleName !== baseline.middleName) payload.middleName = middleName || null;
    if (email !== baseline.email) payload.email = email;
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
    emailError,
    emailValid,
    form,
    onProfileUpdated,
    profile,
  ]);

  const handleStartPhoneFlow = useCallback(async () => {
    const normalized = toApiPhoneDigitsString(phoneInput);
    if (!normalized) {
      setPhoneError('Введите корректный номер телефона');
      setPhoneStatusText(null);
      return;
    }
    const provider = resolvePreferredPhoneProvider(profile);

    setPhoneBusy(true);
    setPhoneError(null);
    setPhoneStatusText(null);

    let createdSessionId: string | null = null;
    try {
      const started = await startPhoneVerification(normalized, provider);
      const startedProvider = (started.provider || provider) as PhoneVerificationProvider;
      createdSessionId = started.sessionId;
      const deepLink = String(started.deepLinkUrl || '').trim();
      const qrPayload = String(started.qrPayload || '').trim();

      if (!isValidPhoneVerificationDeepLink(deepLink, startedProvider)) {
        if (createdSessionId) {
          await cancelPhoneVerification(createdSessionId).catch(() => undefined);
        }
        throw new Error(`${providerLabel(startedProvider)} ссылка не получена. Проверьте настройки сервера.`);
      }

      setPhoneSessionId(createdSessionId);
      setPhoneDeepLinkUrl(deepLink);
      setPhoneQrPayload(qrPayload || deepLink);
      setPhoneMode('pending');
      setPhoneStatusText('Идет привязка телефона...');

      if (!isDesktopWeb) {
        try {
          await openPhoneVerificationDeepLink(deepLink, startedProvider);
        } catch {
          setPhoneError(
            `Не удалось открыть ${providerLabel(startedProvider)} автоматически. Используйте кнопку "Открыть ${providerLabel(startedProvider)}".`
          );
        }
      }
    } catch (e: any) {
      setPhoneError(e?.message || 'Не удалось запустить подтверждение телефона');
      setPhoneMode('editing');
      clearPhoneSessionState();
    } finally {
      setPhoneBusy(false);
    }
  }, [clearPhoneSessionState, isDesktopWeb, phoneInput, profile]);

  const handleOpenTelegram = useCallback(async () => {
    try {
      const provider = resolvePreferredPhoneProvider(profile);
      if (!isValidPhoneVerificationDeepLink(phoneDeepLinkUrl, provider)) {
        throw new Error(`${providerLabel(provider)} ссылка не получена. Проверьте настройки сервера.`);
      }
      await openPhoneVerificationDeepLink(phoneDeepLinkUrl, provider);
    } catch (e: any) {
      setPhoneError(e?.message || 'Не удалось открыть ссылку');
    }
  }, [phoneDeepLinkUrl, profile]);

  const handleCancelPhoneFlow = useCallback(async () => {
    if (!phoneSessionId) return;
    setPhoneBusy(true);
    try {
      await cancelPhoneVerification(phoneSessionId);
      clearPhoneSessionState();
      setPhoneMode('editing');
      setPhoneStatusText('Привязка отменена');
    } catch (e: any) {
      setPhoneError(e?.message || 'Не удалось отменить привязку');
    } finally {
      setPhoneBusy(false);
    }
  }, [clearPhoneSessionState, phoneSessionId]);

  const handleEnterPhoneEditing = useCallback(() => {
    setPhoneInput(profilePhoneMasked);
    setPhoneMode('editing');
    setPhoneError(null);
    setPhoneStatusText(null);
  }, [profilePhoneMasked]);

  const handleCollapsePhone = useCallback(() => {
    setPhoneMode('collapsed');
    setPhoneError(null);
    setPhoneStatusText(null);
    setPhoneInput(profilePhoneMasked);
  }, [profilePhoneMasked]);

  const handleCancel = useCallback(() => {
    setForm(buildProfileForm(profile));
    handleCollapsePhone();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditing(false);
  }, [handleCollapsePhone, profile]);

  return (
    <View style={styles.editCard}>
      <View style={styles.editHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.editTitle}>Данные профиля</Text>
          <Text style={styles.editSubtitle}>
            {refreshing ? 'Синхронизация...' : 'Измените почту и ФИО'}
          </Text>
        </View>
        <Animated.View style={toggleStyle}>
          <Pressable
            onPress={() => {
              if (phoneMode === 'pending') return;
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setEditing((prev) => !prev);
            }}
            disabled={saving || phoneMode === 'pending'}
            onPressIn={() => (toggleScale.value = withSpring(0.97, { damping: 18, stiffness: 260 }))}
            onPressOut={() => (toggleScale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
            onHoverIn={() => (toggleScale.value = withSpring(1.03, { damping: 18, stiffness: 260 }))}
            onHoverOut={() => (toggleScale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
            style={({ pressed }) => [
              styles.editToggle,
              (saving || phoneMode === 'pending') ? styles.verifyBtnDisabled : null,
              pressed ? styles.editTogglePressed : null,
            ]}
            android_ripple={{ color: '#E0E7FF' }}
          >
            <Ionicons name={editing ? 'close-outline' : 'create-outline'} size={16} color={Colors.leaderprod.tint} />
            <Text style={styles.editToggleText}>{editing ? 'Отмена' : 'Изменить'}</Text>
          </Pressable>
        </Animated.View>
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
              {phoneMode === 'editing' ? (
                <>
                  {phoneVerified ? (
                    <Text style={styles.fieldHintText}>Текущий подтвержденный: {displayedPhone}</Text>
                  ) : null}
                  <View style={styles.phoneEditRow}>
                    <TextInput
                      value={phoneInput}
                      onChangeText={(value) => {
                        setPhoneInput(formatPhoneInputMask(value));
                        setPhoneError(null);
                      }}
                      editable={!phoneBusy}
                      style={[styles.fieldInput, styles.phoneEditInput, phoneError && styles.fieldInputError]}
                      placeholder="+7 (___) ___-__-__"
                      keyboardType="phone-pad"
                      autoCorrect={false}
                      maxLength={18}
                    />
                    <Pressable
                      onPress={() => void handleStartPhoneFlow()}
                      disabled={phoneBusy}
                      style={({ pressed }) => [
                        styles.phoneIconBtn,
                        phoneBusy ? styles.verifyBtnDisabled : null,
                        pressed && !phoneBusy ? styles.phoneIconBtnPressed : null,
                      ]}
                    >
                      {phoneBusy ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                      )}
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={handleCollapsePhone}
                    disabled={phoneBusy}
                    style={({ pressed }) => [
                      styles.phoneInlineAction,
                      pressed && !phoneBusy ? styles.verifySecondaryBtnPressed : null,
                    ]}
                  >
                    <Ionicons name="chevron-up-outline" size={16} color="#334155" />
                    <Text style={styles.phoneInlineActionText}>Свернуть</Text>
                  </Pressable>
                </>
              ) : phoneMode === 'pending' ? (
                <>
                  <View style={styles.phonePendingRow}>
                    <ActivityIndicator size="small" color={Colors.leaderprod.button} />
                    <Text style={styles.phonePendingText}>Идет привязка телефона...</Text>
                    <Pressable
                      onPress={() => void handleCancelPhoneFlow()}
                      disabled={phoneBusy}
                      style={({ pressed }) => [
                        styles.phoneDangerIconBtn,
                        (phoneBusy || !phoneSessionId) ? styles.verifyBtnDisabled : null,
                        pressed && !phoneBusy ? styles.phoneDangerIconBtnPressed : null,
                      ]}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </Pressable>
                  </View>
                  {phoneDeepLinkUrl ? (
                    <Pressable
                      onPress={() => void handleOpenTelegram()}
                      disabled={phoneBusy}
                      style={({ pressed }) => [
                        styles.verifySecondaryBtn,
                        pressed && !phoneBusy ? styles.verifySecondaryBtnPressed : null,
                      ]}
                    >
                      <Text style={styles.verifySecondaryBtnText}>Открыть {preferredProviderLabel}</Text>
                    </Pressable>
                  ) : null}
                  {isDesktopWeb && phoneQrPayload ? (
                    <View style={styles.qrWrap}>
                      <QRCode value={phoneQrPayload} size={180} />
                      <Text style={styles.verifyHint}>Сканируйте QR в {preferredProviderLabel} и отправьте контакт</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  {hasPhone ? (
                    <View style={styles.phoneCollapsedTop}>
                      <Text style={styles.phoneCollapsedValue}>{displayedPhone}</Text>
                      <View style={[styles.phoneBadge, phoneVerified ? styles.phoneBadgeVerified : styles.phoneBadgeUnverified]}>
                        <Ionicons
                          name={phoneVerified ? 'checkmark-circle' : 'alert-circle'}
                          size={14}
                          color={phoneVerified ? '#15803D' : '#B45309'}
                        />
                        <Text style={[styles.phoneBadgeText, phoneVerified ? styles.phoneBadgeTextVerified : styles.phoneBadgeTextUnverified]}>
                          {phoneVerified ? 'Подтвержден' : 'Не подтвержден'}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.fieldHintText}>Номер телефона не привязан</Text>
                  )}
                  <Pressable
                    onPress={handleEnterPhoneEditing}
                    style={({ pressed }) => [
                      styles.phoneLinkBtn,
                      pressed ? styles.phoneLinkBtnPressed : null,
                    ]}
                  >
                    <Text style={styles.phoneLinkBtnText}>
                      {!hasPhone ? 'Привязать телефон' : phoneVerified ? 'Изменить номер' : 'Подтвердить'}
                    </Text>
                  </Pressable>
                </>
              )}
              {phoneStatusText ? <Text style={styles.verifyStatus}>{phoneStatusText}</Text> : null}
              {phoneError ? <Text style={styles.fieldErrorText}>{phoneError}</Text> : null}
            </View>
          </View>

          <View style={styles.editActions}>
            <Animated.View style={[saveStyle, { flex: 1 }]}>
              <Pressable
                onPressIn={() => (saveScale.value = withSpring(0.97, { damping: 18, stiffness: 260 }))}
                onPressOut={() => (saveScale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
                onHoverIn={() => (saveScale.value = withSpring(1.03, { damping: 18, stiffness: 260 }))}
                onHoverOut={() => (saveScale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
                onPress={handleSave}
                disabled={saving || phoneMode === 'pending' || !dirty || !emailValid}
                android_ripple={{ color: '#FCD34D' }}
                style={({ pressed }) => [
                  styles.saveBtn,
                  (!dirty || saving || phoneMode === 'pending' || !emailValid) && styles.saveBtnDisabled,
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
                onHoverIn={() => (cancelScale.value = withSpring(1.03, { damping: 18, stiffness: 260 }))}
                onHoverOut={() => (cancelScale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
                onPress={handleCancel}
                disabled={saving || phoneMode === 'pending'}
                android_ripple={{ color: '#E5E7EB' }}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  (saving || phoneMode === 'pending') && styles.cancelBtnDisabled,
                  pressed && styles.cancelBtnPressed,
                ]}
              >
                <Text style={styles.cancelBtnText}>Сбросить</Text>
              </Pressable>
            </Animated.View>
          </View>
        </View>
      ) : (
        loading && !profile ? <ProfileEditorSkeleton /> : <Text style={styles.editHint}>Нажмите «Изменить», чтобы обновить профиль.</Text>
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
  const baseBg = String(Colors.leaderprod.button);

  return (
    <Animated.View
      style={[aStyle, { overflow: 'hidden', borderRadius: 12, alignItems: 'center', marginTop: 16 }]}
    >
      <Pressable
        onPressIn={() => (scale.value = withSpring(0.97, { damping: 18, stiffness: 260 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
        onHoverIn={() => (scale.value = withSpring(1.03, { damping: 18, stiffness: 260 }))}
        onHoverOut={() => (scale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
        onPress={onPress}
        disabled={loading}
        android_ripple={{ color: '#FCD34D' }}
        style={({ pressed }) => [
          styles.refreshBtn,
          pressed && !loading ? { backgroundColor: shadeColor(baseBg, 0.12) } : null,
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
  const baseBg = '#6366F1';

  const signOut = useCallback(async () => {
    try {
      await logoutUser(); // серверный logout (опционально) + очистка токенов
    } finally {
      router.replace('/(auth)/AuthScreen' as Href);
    }
  }, [router]);

  const openConfirm = () => {
    setConfirmVisible(true);
  };

  return (
    <>
      <Animated.View
        style={[aStyle, { overflow: 'hidden', borderRadius: 12, alignItems: 'center', marginTop: 16 }]}
      >
        <Pressable
          onPressIn={() => (scale.value = withSpring(0.97, { damping: 18, stiffness: 260 }))}
          onPressOut={() => (scale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
          onHoverIn={() => (scale.value = withSpring(1.03, { damping: 18, stiffness: 260 }))}
          onHoverOut={() => (scale.value = withSpring(1, { damping: 18, stiffness: 260 }))}
          onPress={openConfirm}
          android_ripple={{ color: '#5B21B6' }}
          style={({ pressed }) => [
            styles.logoutBtn,
            pressed ? { backgroundColor: shadeColor(baseBg, 0.12) } : null,
          ]}
        >
          <Ionicons name="log-out-outline" size={18} color="#fff" />
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </Pressable>
      </Animated.View>

      {/* Кастомная модалка нужна только для web */}
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
  loaderWrap: {
    flex: 1,
    backgroundColor: Colors.leaderprod.background,
    paddingHorizontal: 16,
  },
  loaderCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
  },
  loaderText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
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
  fieldInputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  fieldInputError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  fieldErrorText: { color: '#DC2626', fontSize: 12, fontWeight: '600' },
  fieldHintText: { color: '#64748B', fontSize: 12 },
  phoneCollapsedTop: { gap: 8 },
  phoneCollapsedValue: { color: '#0F172A', fontWeight: '700', fontSize: 14 },
  phoneBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  phoneBadgeVerified: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  phoneBadgeUnverified: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  phoneBadgeText: { fontSize: 12, fontWeight: '700' },
  phoneBadgeTextVerified: { color: '#15803D' },
  phoneBadgeTextUnverified: { color: '#B45309' },
  phoneLinkBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  phoneLinkBtnPressed: { backgroundColor: '#F8FAFC' },
  phoneLinkBtnText: { color: '#1E293B', fontWeight: '700' },
  phoneEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phoneEditInput: { flex: 1 },
  phoneIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.leaderprod.button,
  },
  phoneIconBtnPressed: { backgroundColor: '#F59E0B' },
  phoneInlineAction: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  phoneInlineActionText: { color: '#334155', fontWeight: '600', fontSize: 12 },
  phonePendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phonePendingText: { flex: 1, color: '#1E293B', fontWeight: '600', fontSize: 13 },
  phoneDangerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
  },
  phoneDangerIconBtnPressed: { backgroundColor: '#B91C1C' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  verifyStatus: { color: '#1D4ED8', fontWeight: '600', fontSize: 12 },
  verifySecondaryBtn: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#fff',
  },
  verifySecondaryBtnPressed: { backgroundColor: '#F8FAFC' },
  verifySecondaryBtnText: { color: '#1E293B', fontWeight: '700' },
  verifyBtnDisabled: { opacity: 0.65 },
  qrWrap: {
    marginTop: 6,
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  verifyHint: { fontSize: 12, color: '#64748B', textAlign: 'center' },
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
  credentialsCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  credentialsTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  credentialsSubtitle: { fontSize: 12, color: '#64748B' },
  credentialsHint: { fontSize: 12, color: '#374151' },
  credentialsError: { color: '#B91C1C', fontWeight: '700', fontSize: 12 },
  credentialsNotice: { color: '#1D4ED8', fontWeight: '700', fontSize: 12 },
  credentialsButton: {
    marginTop: 4,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: Colors.leaderprod.button,
  },
  credentialsButtonPressed: {
    backgroundColor: '#F59E0B',
  },
  credentialsButtonDisabled: {
    backgroundColor: Colors.leaderprod.buttonDisabled,
  },
  credentialsButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  credentialsSecondaryButton: {
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  credentialsSecondaryButtonPressed: {
    backgroundColor: '#E0E7FF',
  },
  credentialsSecondaryButtonText: {
    color: '#3730A3',
    fontWeight: '700',
  },
  credentialsDoneWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  credentialsDoneText: {
    color: '#166534',
    fontWeight: '700',
  },
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

