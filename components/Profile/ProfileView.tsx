import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Skeleton } from 'moti/skeleton';
import Animated, {
  FadeInDown,
  FadeInUp,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  withSpring,
} from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/Colors';
import { Profile, ProfileType, ProfileStatus } from '@/types/userTypes';
import {
  cancelEmailChange,
  cancelPhoneVerification,
  getPhoneVerificationStatus,
  getProfileById,
  resendEmailChangeCode,
  startEmailChange,
  startPhoneVerification,
  updateMyProfile,
  uploadProfileAvatar,
  verifyEmailChange,
} from '@/utils/userService';
import AvatarCropperModal from '@/components/ui/AvatarCropperModal';
import { AuthContext } from '@/context/AuthContext';
import { usePresence } from '@/hooks/usePresence';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import * as ImagePicker from 'expo-image-picker';
import { shadeColor, tintColor } from '@/utils/color';
import { formatPhoneDisplay, formatPhoneInputMask, normalizePhoneInputToDigits11, toApiPhoneDigitsString } from '@/utils/phone';
import { getRoleDisplayName } from '@/utils/rbacLabels';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type Tone = 'green' | 'violet' | 'gray' | 'red' | 'blue';
type Chip = { icon: IoniconName; label: string; tone?: Tone };
type CropImage = { uri: string; width: number; height: number };
type NameFormState = { firstName: string; lastName: string; middleName: string };
type PhoneMode = 'collapsed' | 'editing' | 'pending';
type PhoneVerificationProvider = 'TELEGRAM' | 'MAX';
type EmailMode = 'view' | 'editing' | 'pending_code';
type NameMode = 'view' | 'editing';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const toMaskedPhoneValue = (value?: string | null) => formatPhoneInputMask(value || '');

export type ProfileViewProps = {
  /** Если указан - показываем чужой профиль, иначе - текущий */
  userId?: number;
  style?: ViewStyle;
  profileOverride?: Profile | null;
  loadingOverride?: boolean;
  errorOverride?: string | null;
  onProfileUpdated?: (profile: Profile) => void;
};

/* ---------- helpers ---------- */

const profTypeName = (t?: ProfileType | null) =>
  t === 'EMPLOYEE' ? 'Сотрудник' : t === 'CLIENT' ? 'Клиент' : t === 'SUPPLIER' ? 'Поставщик' : 'Неизвестно';

const profStatusTone = (s?: ProfileStatus): Tone =>
  s === 'ACTIVE' ? 'green' : s === 'PENDING' ? 'blue' : s === 'BLOCKED' ? 'red' : 'gray';

function resolvePreferredPhoneProvider(profile: Profile | null): PhoneVerificationProvider {
  const hasTelegram = Boolean(profile?.authMethods?.telegramLinked ?? profile?.telegramId);
  const hasMax = Boolean(profile?.authMethods?.maxLinked ?? profile?.maxId);
  if (hasMax && !hasTelegram) return 'MAX';
  return 'TELEGRAM';
}

function isValidPhoneVerificationDeepLink(url: string, provider: PhoneVerificationProvider) {
  const raw = String(url || '').trim();
  if (provider === 'MAX') {
    return /^https:\/\/max\.ru\/.+\?start=verify_phone_[A-Za-z0-9_-]+$/.test(raw);
  }
  return /^https:\/\/t\.me\/.+\?start=verify_phone_[A-Za-z0-9_-]+$/.test(raw);
}

function providerLabel(provider: PhoneVerificationProvider) {
  return provider === 'MAX' ? 'MAX' : 'Telegram';
}

async function openPhoneVerificationDeepLink(url: string, provider: PhoneVerificationProvider) {
  if (!url) throw new Error(`${providerLabel(provider)} ссылка не получена. Проверьте настройки сервера.`);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}

function mapPhoneVerificationReason(reason?: string | null, provider: PhoneVerificationProvider = 'TELEGRAM') {
  if (!reason) return 'Не удалось подтвердить телефон';
  if (reason === 'PHONE_MISMATCH') return `Номер из ${providerLabel(provider)} не совпал с введённым номером`;
  if (reason === 'PHONE_ALREADY_USED') return 'Этот номер уже используется другим пользователем';
  if (reason === 'TELEGRAM_ALREADY_USED') return 'Этот Telegram уже привязан к другому пользователю';
  if (reason === 'MAX_ALREADY_USED') return 'Этот MAX уже привязан к другому пользователю';
  if (reason === 'SESSION_EXPIRED') return 'Сессия подтверждения истекла';
  return 'Не удалось подтвердить телефон';
}

function buildNameForm(profile: Profile | null): NameFormState {
  return {
    firstName: profile?.firstName || '',
    lastName: profile?.lastName || '',
    middleName: profile?.middleName || '',
  };
}

/* ---------- main component ---------- */

export function ProfileView({
  userId,
  style,
  profileOverride,
  loadingOverride,
  errorOverride,
  onProfileUpdated,
}: ProfileViewProps) {
  const auth = useContext(AuthContext);
  const usingOverride = profileOverride !== undefined;
  const isSelf = userId == null;

  const [profile, setProfile] = useState<Profile | null>(profileOverride ?? null);
  const [loading, setLoading] = useState(usingOverride ? Boolean(loadingOverride) : true);
  const [err, setErr] = useState<string | null>(errorOverride ?? null);
  const [cropImage, setCropImage] = useState<CropImage | null>(null);
  const [cropVisible, setCropVisible] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [nameMode, setNameMode] = useState<NameMode>('view');
  const [nameForm, setNameForm] = useState<NameFormState>(() => buildNameForm(profileOverride ?? null));
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [emailMode, setEmailMode] = useState<EmailMode>('view');
  const [emailInput, setEmailInput] = useState((profileOverride?.email || '').trim());
  const [emailCode, setEmailCode] = useState('');
  const [emailSessionId, setEmailSessionId] = useState<string | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 768;
  const [phoneMode, setPhoneMode] = useState<PhoneMode>('collapsed');
  const [phoneInput, setPhoneInput] = useState(toMaskedPhoneValue(profileOverride?.phone || ''));
  const [phoneSessionId, setPhoneSessionId] = useState<string | null>(null);
  const [phoneDeepLinkUrl, setPhoneDeepLinkUrl] = useState('');
  const [phoneQrPayload, setPhoneQrPayload] = useState('');
  const [phoneProvider, setPhoneProvider] = useState<PhoneVerificationProvider>(
    resolvePreferredPhoneProvider(profileOverride ?? null)
  );
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneStatusText, setPhoneStatusText] = useState<string | null>(null);

  const presenceMap = usePresence(!isSelf && profile ? [profile.id] : []);
  const presence = !isSelf && profile ? presenceMap[profile.id] : undefined;
  const presenceLabel = useMemo(() => {
    if (!presence) return null;
    if (presence.isOnline) return 'В сети';
    if (presence.lastSeenAt) {
      return `Был(а) ${formatDistanceToNow(new Date(presence.lastSeenAt), { addSuffix: true, locale: ru })}`;
    }
    return 'Не в сети';
  }, [presence]);

  const applyProfile = useCallback(
    (next: Profile) => {
      setProfile(next);
      onProfileUpdated?.(next);
      if (isSelf && auth?.setProfile) {
        void auth.setProfile(next);
      }
    },
    [auth, isSelf, onProfileUpdated]
  );

  const refreshProfile = useCallback(async () => {
    const next = await getProfileById(userId);
    if (!next) {
      throw new Error('Не удалось загрузить профиль');
    }
    applyProfile(next);
    setErr(null);
    return next;
  }, [applyProfile, userId]);

  useEffect(() => {
    if (usingOverride) return;
    let alive = true;
    void (async () => {
      try {
        if (alive) {
          setLoading(true);
          setErr(null);
        }
        const data = await getProfileById(userId);
        if (!alive) return;
        if (!data) {
          setErr('Не удалось загрузить профиль');
        } else {
          applyProfile(data);
        }
      } catch (e) {
        if (!alive) return;
        console.error('Profile fetch error:', e);
        setErr('Не удалось загрузить профиль');
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyProfile, userId, usingOverride]);

  useEffect(() => {
    if (!usingOverride) return;
    setProfile(profileOverride ?? null);
    setLoading(Boolean(loadingOverride));
    setErr(errorOverride ?? null);
  }, [errorOverride, loadingOverride, profileOverride, usingOverride]);

  useEffect(() => {
    if (nameMode === 'view') {
      setNameForm(buildNameForm(profile));
      setNameError(null);
    }
  }, [nameMode, profile]);

  useEffect(() => {
    if (emailMode === 'view') {
      setEmailInput((profile?.email || '').trim());
      setEmailCode('');
      setEmailSessionId(null);
      setEmailError(null);
    }
  }, [emailMode, profile?.email]);

  const profilePhoneDigits = normalizePhoneInputToDigits11(profile?.phone || '') || '';
  const profilePhoneMasked = toMaskedPhoneValue(profilePhoneDigits);
  useEffect(() => {
    if (phoneMode !== 'pending') {
      setPhoneInput(profilePhoneMasked);
    }
  }, [phoneMode, profilePhoneMasked]);

  useEffect(() => {
    if (phoneMode === 'pending') return;
    setPhoneProvider(resolvePreferredPhoneProvider(profile));
  }, [phoneMode, profile]);

  const resolveImageSize = async (uri: string, width?: number, height?: number): Promise<CropImage> => {
    if (width && height) return { uri, width, height };
    return new Promise((resolve, reject) => {
      Image.getSize(
        uri,
        (w, h) => resolve({ uri, width: w, height: h }),
        (err) => reject(err)
      );
    });
  };

  const handlePickAvatar = async () => {
    if (!profile) return;
    if (!profile.currentProfileType) {
      Alert.alert('Профиль не выбран', 'Сначала выберите тип профиля.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Нет доступа', 'Нужен доступ к галерее.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    try {
      const resolved = await resolveImageSize(asset.uri, asset.width ?? undefined, asset.height ?? undefined);
      setCropImage(resolved);
      setCropVisible(true);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось обработать изображение');
    }
  };

  const handleConfirmCrop = async (img: CropImage) => {
    if (!profile?.currentProfileType) return;
    setCropVisible(false);
    setUploadingAvatar(true);
    try {
      const updated = await uploadProfileAvatar(profile.currentProfileType, { uri: img.uri });
      if (updated) {
        applyProfile(updated);
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось обновить аватар');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const clearPhoneSessionState = useCallback(() => {
    setPhoneSessionId(null);
    setPhoneDeepLinkUrl('');
    setPhoneQrPayload('');
  }, []);

  const checkPhoneSessionStatus = useCallback(
    async (activeSessionId: string) => {
      const session = await getPhoneVerificationStatus(activeSessionId);
      if (session.status === 'PENDING') return;

      if (session.status === 'VERIFIED') {
        clearPhoneSessionState();
        setPhoneStatusText(null);
        setPhoneError(null);
        setPhoneMode('collapsed');
        await refreshProfile();
        return;
      }

      clearPhoneSessionState();
      setPhoneMode('editing');
      if (session.status === 'FAILED') {
        setPhoneError(mapPhoneVerificationReason(session.failureReason, phoneProvider));
      } else if (session.status === 'EXPIRED') {
        setPhoneError('Сессия подтверждения истекла. Запустите подтверждение снова.');
      } else if (session.status === 'CANCELLED') {
        setPhoneStatusText('Привязка отменена');
      }
    },
    [clearPhoneSessionState, refreshProfile]
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

  const handleSaveName = useCallback(async () => {
    if (!profile) return;
    const payload: { firstName?: string | null; lastName?: string | null; middleName?: string | null } = {};
    const nextFirst = nameForm.firstName.trim();
    const nextLast = nameForm.lastName.trim();
    const nextMiddle = nameForm.middleName.trim();
    const baseFirst = (profile.firstName || '').trim();
    const baseLast = (profile.lastName || '').trim();
    const baseMiddle = (profile.middleName || '').trim();

    if (nextFirst !== baseFirst) payload.firstName = nextFirst || null;
    if (nextLast !== baseLast) payload.lastName = nextLast || null;
    if (nextMiddle !== baseMiddle) payload.middleName = nextMiddle || null;

    if (!Object.keys(payload).length) {
      setNameMode('view');
      return;
    }

    setNameSaving(true);
    setNameError(null);
    try {
      const updated = await updateMyProfile(payload);
      if (updated) {
        applyProfile(updated);
      }
      setNameMode('view');
    } catch (e: any) {
      setNameError(e?.message || 'Не удалось обновить ФИО');
    } finally {
      setNameSaving(false);
    }
  }, [applyProfile, nameForm, profile]);

  const handleStartEmailFlow = useCallback(async () => {
    const nextEmail = emailInput.trim().toLowerCase();
    if (!EMAIL_RE.test(nextEmail)) {
      setEmailError('Введите корректный email');
      setEmailNotice(null);
      return;
    }
    setEmailSaving(true);
    setEmailError(null);
    setEmailNotice(null);
    try {
      const started = await startEmailChange(nextEmail);
      setEmailSessionId(started.sessionId);
      setEmailMode('pending_code');
      setEmailCode('');
      setEmailNotice(`Код отправлен на ${started.requestedEmail}`);
    } catch (e: any) {
      setEmailError(e?.message || 'Не удалось отправить код подтверждения');
    } finally {
      setEmailSaving(false);
    }
  }, [emailInput]);

  const handleVerifyEmailCode = useCallback(async () => {
    if (!emailSessionId) {
      setEmailError('Сессия подтверждения не найдена');
      return;
    }
    if (!/^\d{6}$/.test(emailCode.trim())) {
      setEmailError('Введите 6-значный код');
      return;
    }
    setEmailSaving(true);
    setEmailError(null);
    try {
      const updated = await verifyEmailChange(emailSessionId, emailCode.trim());
      if (updated) {
        applyProfile(updated);
      } else {
        await refreshProfile();
      }
      setEmailMode('view');
      setEmailSessionId(null);
      setEmailCode('');
      setEmailNotice('Email успешно подтвержден и обновлён');
    } catch (e: any) {
      setEmailError(e?.message || 'Не удалось подтвердить код');
    } finally {
      setEmailSaving(false);
    }
  }, [applyProfile, emailCode, emailSessionId, refreshProfile]);

  const handleResendEmailCode = useCallback(async () => {
    if (!emailSessionId) {
      setEmailError('Сессия подтверждения не найдена');
      return;
    }
    setEmailSaving(true);
    setEmailError(null);
    try {
      await resendEmailChangeCode(emailSessionId);
      setEmailNotice('Код отправлен повторно');
    } catch (e: any) {
      setEmailError(e?.message || 'Не удалось отправить код повторно');
    } finally {
      setEmailSaving(false);
    }
  }, [emailSessionId]);

  const handleCancelEmailFlow = useCallback(async () => {
    if (emailSessionId) {
      try {
        await cancelEmailChange(emailSessionId);
      } catch {
        // ignore
      }
    }
    setEmailMode('view');
    setEmailSessionId(null);
    setEmailCode('');
    setEmailError(null);
  }, [emailSessionId]);

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
      setPhoneProvider(startedProvider);
      setPhoneMode('pending');
      setPhoneStatusText('Идёт привязка телефона...');

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
      if (!isValidPhoneVerificationDeepLink(phoneDeepLinkUrl, phoneProvider)) {
        throw new Error(`${providerLabel(phoneProvider)} ссылка не получена. Проверьте настройки сервера.`);
      }
      await openPhoneVerificationDeepLink(phoneDeepLinkUrl, phoneProvider);
    } catch (e: any) {
      setPhoneError(e?.message || `Не удалось открыть ${providerLabel(phoneProvider)} ссылку`);
    }
  }, [phoneDeepLinkUrl, phoneProvider]);

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

  if (loading && !profile) {
    return (
      <View style={style}>
        <ProfileSkeleton showActions={!isSelf} />
      </View>
    );
  }
  if (err || !profile) {
    return (
      <View style={[styles.center, style]}>
        <Text style={{ color: Colors.leaderprod.text }}>{err ?? 'Ошибка'}</Text>
      </View>
    );
  }

  const {
    firstName,
    lastName,
    middleName,
    email,
    avatarUrl,
    currentProfileType,
    profileStatus,
    role,
    employeeProfile,
    departmentRoles,
    id,
  } = profile;

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  const initials = `${(firstName?.[0] ?? '').toUpperCase()}${(lastName?.[0] ?? '').toUpperCase()}` || '👤';
  const hasPhone = Boolean(profilePhoneDigits);
  const phoneVerified = Boolean(profilePhoneDigits && profile.phoneVerifiedAt);
  const phoneDisplay = profilePhoneDigits ? formatPhoneDisplay(profilePhoneDigits) : '';
  const deptName = employeeProfile?.department?.name;

  const chips: Chip[] = [
    { icon: 'id-card-outline' as IoniconName, label: profTypeName(currentProfileType), tone: 'violet' },
    { icon: 'shield-checkmark-outline' as IoniconName, label: profileStatus ?? '—', tone: profStatusTone(profileStatus) },
    { icon: 'person-outline' as IoniconName, label: getRoleDisplayName(role), tone: 'blue' },
    ...(deptName ? [{ icon: 'business-outline' as IoniconName, label: deptName, tone: 'gray' as Tone }] : []),
  ];

  const facts: Array<{ icon: IoniconName; label: string; value?: string }> = [
    { icon: 'barcode-outline', label: 'ID пользователя', value: String(id) },
    {
      icon: 'calendar-outline',
      label: 'Создан',
      value: employeeProfile?.createdAt ? new Date(employeeProfile.createdAt).toLocaleString() : '—',
    },
    {
      icon: 'refresh-outline',
      label: 'Обновлён',
      value: employeeProfile?.updatedAt ? new Date(employeeProfile.updatedAt).toLocaleString() : '—',
    },
  ];

  return (
    <View style={style}>
      {/* HERO */}
      <Hero
        avatarUrl={avatarUrl || undefined}
        initials={initials}
        title={fullName || 'Профиль'}
        subtitle={deptName ? `${profTypeName(currentProfileType)} • ${deptName}` : profTypeName(currentProfileType)}
        chips={chips}
        presenceLabel={!isSelf ? presenceLabel : null}
        presenceOnline={presence?.isOnline}
        avatarEditable={isSelf}
        avatarBusy={uploadingAvatar}
        onEditAvatar={handlePickAvatar}
        canManageName={isSelf}
        nameMode={nameMode}
        nameForm={nameForm}
        nameSaving={nameSaving}
        nameError={nameError}
        onNameChange={(key, value) => {
          setNameForm((prev) => ({ ...prev, [key]: value }));
          setNameError(null);
        }}
        onNameEdit={() => {
          setNameMode('editing');
          setNameError(null);
        }}
        onNameCancel={() => {
          setNameMode('view');
          setNameError(null);
          setNameForm(buildNameForm(profile));
        }}
        onNameSave={() => void handleSaveName()}
      />

      {/* Действия — не показываем для своего профиля */}
      {!isSelf && (
        <Animated.View entering={FadeInUp.delay(120).duration(500)} style={styles.actionsRow}>
          <ActionButton
            label="Написать"
            icon="mail-outline"
            disabled={!email}
            onPress={() => email && Linking.openURL(`mailto:${email}`)}
          />
          <ActionButton
            label="Позвонить"
            icon="call-outline"
            disabled={!profilePhoneDigits}
            onPress={() => profilePhoneDigits && Linking.openURL(`tel:+${profilePhoneDigits}`)}
          />
          <ActionButton
            label="Скопировать"
            icon="copy-outline"
            onPress={() => {
              const text = [fullName, email, phoneDisplay].filter(Boolean).join(' • ');
              if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
                (navigator as any).clipboard.writeText(text);
              }
            }}
          />
        </Animated.View>
      )}

      {/* Основные факты */}
      <Animated.View
        entering={FadeInDown.delay(150).duration(600)}
        layout={Layout.springify()}
        style={styles.cardsWrap}
      >
        <EmailInfoCard
          email={email || ''}
          canManage={isSelf}
          mode={emailMode}
          emailInput={emailInput}
          codeInput={emailCode}
          busy={emailSaving}
          error={emailError}
          notice={emailNotice}
          onEmailInputChange={(value) => {
            setEmailInput(value.replace(/\s+/g, ''));
            setEmailError(null);
          }}
          onCodeInputChange={(value) => {
            setEmailCode(value.replace(/\D+/g, '').slice(0, 6));
            setEmailError(null);
          }}
          onStartEdit={() => {
            setEmailMode('editing');
            setEmailError(null);
            setEmailNotice(null);
            setEmailInput((profile.email || '').trim());
          }}
          onStartFlow={() => void handleStartEmailFlow()}
          onVerify={() => void handleVerifyEmailCode()}
          onResend={() => void handleResendEmailCode()}
          onCancel={() => void handleCancelEmailFlow()}
        />
        <PhoneInfoCard
          phoneDisplay={phoneDisplay}
          hasPhone={hasPhone}
          verified={phoneVerified}
          canManage={isSelf}
          mode={phoneMode}
          phoneInput={phoneInput}
          busy={phoneBusy}
          deepLinkUrl={phoneDeepLinkUrl}
          qrPayload={phoneQrPayload}
          provider={phoneProvider}
          showDesktopQr={isDesktopWeb}
          statusText={phoneStatusText}
          error={phoneError}
          onChangePhoneInput={(raw) => {
            setPhoneInput(raw ?? '');
            setPhoneError(null);
          }}
          onStartEdit={() => {
            setPhoneMode('editing');
            setPhoneError(null);
            setPhoneStatusText(null);
          }}
          onCollapseEdit={() => {
            setPhoneMode('collapsed');
            setPhoneError(null);
            setPhoneStatusText(null);
            setPhoneInput(profilePhoneMasked);
          }}
          onStartFlow={() => void handleStartPhoneFlow()}
          onOpenMessenger={() => void handleOpenTelegram()}
          onCancelFlow={() => void handleCancelPhoneFlow()}
        />
        {facts.map((f, i) => (
          <InfoCard key={i} icon={f.icon} label={f.label} value={f.value} delay={(i + 1) * 60} />
        ))}
      </Animated.View>

      {/* Роли по отделам */}
      {departmentRoles?.length ? (
        <Animated.View entering={FadeInDown.delay(180).duration(600)} layout={Layout.springify()}>
          <Text style={styles.sectionTitle}>Роли по отделам</Text>
          <View style={{ gap: 10 }}>
            {departmentRoles.map((dr, idx) => (
              <DepartmentRoleRow
                key={`${dr.department?.id}-${dr.role?.id}-${idx}`}
                department={dr.department?.name || `Отдел #${dr.department?.id ?? '—'}`}
                roleName={getRoleDisplayName(dr.role)}
                delay={idx * 60}
              />
            ))}
          </View>
        </Animated.View>
        ) : null}
      <AvatarCropperModal
        visible={cropVisible}
        image={cropImage}
        onCancel={() => setCropVisible(false)}
        onConfirm={handleConfirmCrop}
      />
    </View>
  );
}

/* ---------- subcomponents ---------- */

function Hero({
  avatarUrl,
  initials,
  title,
  subtitle,
  chips,
  presenceLabel,
  presenceOnline,
  avatarEditable,
  avatarBusy,
  onEditAvatar,
  canManageName,
  nameMode,
  nameForm,
  nameSaving,
  nameError,
  onNameChange,
  onNameEdit,
  onNameCancel,
  onNameSave,
}: {
  avatarUrl?: string;
  initials: string;
  title: string;
  subtitle?: string;
  chips: Chip[];
  presenceLabel?: string | null;
  presenceOnline?: boolean;
  avatarEditable?: boolean;
  avatarBusy?: boolean;
  onEditAvatar?: () => void;
  canManageName?: boolean;
  nameMode: NameMode;
  nameForm: NameFormState;
  nameSaving: boolean;
  nameError?: string | null;
  onNameChange: (key: keyof NameFormState, value: string) => void;
  onNameEdit: () => void;
  onNameCancel: () => void;
  onNameSave: () => void;
}) {
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, []);
  const avatarAnim = useAnimatedStyle(() => {
    const y = (float.value - 0.5) * 8;
    const s = 1 + (float.value - 0.5) * 0.04;
    return { transform: [{ translateY: y }, { scale: s }] };
  });

  return (
    <Animated.View entering={FadeInDown.duration(600)} style={styles.heroWrap}>
      <LinearGradient
        colors={['#C7D2FE', '#E9D5FF']}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBg}
      />
      <View style={styles.heroInner}>
        <Pressable
          onPress={avatarEditable ? onEditAvatar : undefined}
          disabled={!avatarEditable || avatarBusy}
          style={{ alignSelf: 'flex-start' }}
        >
          <Animated.View style={[styles.avatarOuter, avatarAnim]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            {avatarEditable ? (
              <View style={styles.avatarEditBadge}>
                {avatarBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={16} color="#fff" />
                )}
              </View>
            ) : null}
          </Animated.View>
        </Pressable>

        {nameMode === 'editing' ? (
          <View style={styles.inlineNameEditor}>
            <TextInput
              value={nameForm.lastName}
              onChangeText={(value) => onNameChange('lastName', value)}
              placeholder="Фамилия"
              style={styles.heroInput}
              editable={!nameSaving}
              autoCapitalize="words"
            />
            <TextInput
              value={nameForm.firstName}
              onChangeText={(value) => onNameChange('firstName', value)}
              placeholder="Имя"
              style={styles.heroInput}
              editable={!nameSaving}
              autoCapitalize="words"
            />
            <TextInput
              value={nameForm.middleName}
              onChangeText={(value) => onNameChange('middleName', value)}
              placeholder="Отчество"
              style={styles.heroInput}
              editable={!nameSaving}
              autoCapitalize="words"
            />
            <View style={styles.inlineActionsRow}>
              <Pressable
                onPress={onNameSave}
                disabled={nameSaving}
                style={({ pressed }) => [
                  styles.inlinePrimaryBtn,
                  pressed && !nameSaving ? styles.inlinePrimaryBtnPressed : null,
                  nameSaving ? styles.inlineBtnDisabled : null,
                ]}
              >
                {nameSaving ? <ActivityIndicator color="#fff" size="small" /> : null}
                <Text style={styles.inlinePrimaryBtnText}>{nameSaving ? 'Сохранение...' : 'Сохранить'}</Text>
              </Pressable>
              <Pressable
                onPress={onNameCancel}
                disabled={nameSaving}
                style={({ pressed }) => [
                  styles.inlineSecondaryBtn,
                  pressed && !nameSaving ? styles.inlineSecondaryBtnPressed : null,
                  nameSaving ? styles.inlineBtnDisabled : null,
                ]}
              >
                <Text style={styles.inlineSecondaryBtnText}>Отмена</Text>
              </Pressable>
            </View>
            {nameError ? <Text style={styles.inlineErrorText}>{nameError}</Text> : null}
          </View>
        ) : (
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle}>{title}</Text>
            {canManageName ? (
              <Pressable
                onPress={onNameEdit}
                style={({ pressed }) => [styles.yellowPillBtn, pressed ? styles.yellowPillBtnPressed : null]}
              >
                <Ionicons name="create-outline" size={14} color={Colors.leaderprod.tint} />
                <Text style={styles.yellowPillBtnText}>Изменить</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
        {presenceLabel ? (
          <View style={styles.presenceRow}>
            <View
              style={[
                styles.presenceDot,
                { backgroundColor: presenceOnline ? '#22c55e' : '#94a3b8' },
              ]}
            />
            <Text style={styles.presenceText}>{presenceLabel}</Text>
          </View>
        ) : null}

        <View style={styles.chipsRow}>
          {chips.map((c, idx) => (
            <Chip key={idx} icon={c.icon} label={c.label} tone={c.tone} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

function Chip({
  label,
  icon,
  tone = 'gray',
}: {
  label: string;
  icon: IoniconName;
  tone?: Tone;
}) {
  const palette = {
    green: { bg: '#DCFCE7', bd: '#86EFAC', text: '#166534' },
    violet: { bg: '#EDE9FE', bd: '#C4B5FD', text: '#4C1D95' },
    gray: { bg: '#F3F4F6', bd: '#E5E7EB', text: '#374151' },
    red: { bg: '#FEE2E2', bd: '#FCA5A5', text: '#991B1B' },
    blue: { bg: '#DBEAFE', bd: '#93C5FD', text: '#1E3A8A' },
  }[tone];

  return (
    <View style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.bd }]}>
      <Ionicons name={icon} size={14} color={palette.text} />
      <Text style={[styles.chipText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function EmailInfoCard({
  email,
  canManage,
  mode,
  emailInput,
  codeInput,
  busy,
  error,
  notice,
  onEmailInputChange,
  onCodeInputChange,
  onStartEdit,
  onStartFlow,
  onVerify,
  onResend,
  onCancel,
}: {
  email: string;
  canManage: boolean;
  mode: EmailMode;
  emailInput: string;
  codeInput: string;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onEmailInputChange: (value: string) => void;
  onCodeInputChange: (value: string) => void;
  onStartEdit: () => void;
  onStartFlow: () => void;
  onVerify: () => void;
  onResend: () => void;
  onCancel: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(20).duration(400)} layout={Layout.springify()}>
      <View style={styles.infoCard}>
        <View style={styles.infoIcon}>
          <Ionicons name="mail-outline" size={18} color="#4F46E5" />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.infoLabel}>Email</Text>
          {mode === 'editing' ? (
            <>
              <TextInput
                value={emailInput}
                onChangeText={onEmailInputChange}
                style={[styles.fieldInput, error ? styles.fieldInputError : null]}
                placeholder="example@mail.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!busy}
              />
              <View style={styles.inlineActionsRow}>
                <Pressable
                  onPress={onStartFlow}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.inlinePrimaryBtn,
                    pressed && !busy ? styles.inlinePrimaryBtnPressed : null,
                    busy ? styles.inlineBtnDisabled : null,
                  ]}
                >
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : null}
                  <Text style={styles.inlinePrimaryBtnText}>{busy ? 'Отправка...' : 'Отправить код'}</Text>
                </Pressable>
                <Pressable
                  onPress={onCancel}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.inlineSecondaryBtn,
                    pressed && !busy ? styles.inlineSecondaryBtnPressed : null,
                    busy ? styles.inlineBtnDisabled : null,
                  ]}
                >
                  <Text style={styles.inlineSecondaryBtnText}>Отмена</Text>
                </Pressable>
              </View>
            </>
          ) : mode === 'pending_code' ? (
            <>
              <Text style={styles.fieldHintText}>Код отправлен на {emailInput || 'новый email'}</Text>
              <TextInput
                value={codeInput}
                onChangeText={onCodeInputChange}
                style={[styles.fieldInput, error ? styles.fieldInputError : null]}
                placeholder="Введите 6-значный код"
                keyboardType="number-pad"
                editable={!busy}
                maxLength={6}
              />
              <View style={styles.inlineActionsWrap}>
                <Pressable
                  onPress={onVerify}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.inlinePrimaryBtn,
                    pressed && !busy ? styles.inlinePrimaryBtnPressed : null,
                    busy ? styles.inlineBtnDisabled : null,
                  ]}
                >
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : null}
                  <Text style={styles.inlinePrimaryBtnText}>{busy ? 'Проверка...' : 'Подтвердить'}</Text>
                </Pressable>
                <Pressable
                  onPress={onResend}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.inlineSecondaryBtn,
                    pressed && !busy ? styles.inlineSecondaryBtnPressed : null,
                    busy ? styles.inlineBtnDisabled : null,
                  ]}
                >
                  <Text style={styles.inlineSecondaryBtnText}>Отправить код повторно</Text>
                </Pressable>
                <Pressable
                  onPress={onCancel}
                  disabled={busy}
                  style={({ pressed }) => [styles.inlineGhostBtn, pressed && !busy ? styles.inlineGhostBtnPressed : null]}
                >
                  <Text style={styles.inlineGhostBtnText}>Отмена</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.infoValue} numberOfLines={2}>
                {email || '—'}
              </Text>
              {canManage ? (
                <Pressable
                  onPress={onStartEdit}
                  style={({ pressed }) => [styles.yellowPillBtn, pressed ? styles.yellowPillBtnPressed : null]}
                >
                  <Ionicons name="create-outline" size={14} color={Colors.leaderprod.tint} />
                  <Text style={styles.yellowPillBtnText}>Изменить</Text>
                </Pressable>
              ) : null}
            </>
          )}
          {notice ? <Text style={styles.inlineNoticeText}>{notice}</Text> : null}
          {error ? <Text style={styles.inlineErrorText}>{error}</Text> : null}
        </View>
      </View>
    </Animated.View>
  );
}

function PhoneInfoCard({
  phoneDisplay,
  hasPhone,
  verified,
  canManage,
  mode,
  phoneInput,
  busy,
  deepLinkUrl,
  qrPayload,
  provider,
  showDesktopQr,
  statusText,
  error,
  onChangePhoneInput,
  onStartEdit,
  onCollapseEdit,
  onStartFlow,
  onOpenMessenger,
  onCancelFlow,
}: {
  phoneDisplay: string;
  hasPhone: boolean;
  verified: boolean;
  canManage: boolean;
  mode: PhoneMode;
  phoneInput: string;
  busy: boolean;
  deepLinkUrl: string;
  qrPayload: string;
  provider: PhoneVerificationProvider;
  showDesktopQr: boolean;
  statusText: string | null;
  error: string | null;
  onChangePhoneInput: (value: string) => void;
  onStartEdit: () => void;
  onCollapseEdit: () => void;
  onStartFlow: () => void;
  onOpenMessenger: () => void;
  onCancelFlow: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(60).duration(400)} layout={Layout.springify()}>
      <View style={styles.infoCard}>
        <View style={styles.infoIcon}>
          <Ionicons name="call-outline" size={18} color="#4F46E5" />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.infoLabel}>Телефон</Text>
          {mode === 'editing' ? (
            <>
              {verified && hasPhone ? <Text style={styles.fieldHintText}>Текущий подтверждённый: {phoneDisplay}</Text> : null}
              <View style={styles.phoneEditRow}>
                <TextInput
                  value={phoneInput}
                  onChangeText={(value) => onChangePhoneInput(formatPhoneInputMask(value))}
                  style={[styles.fieldInput, styles.phoneInput, error ? styles.fieldInputError : null]}
                  placeholder="+7 (___) ___-__-__"
                  keyboardType="phone-pad"
                  editable={!busy}
                  autoCorrect={false}
                  maxLength={18}
                />
                <Pressable
                  onPress={onStartFlow}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.phonePrimaryBtn,
                    pressed && !busy ? styles.phonePrimaryBtnPressed : null,
                    busy ? styles.inlineBtnDisabled : null,
                  ]}
                >
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-forward" size={18} color="#fff" />}
                </Pressable>
              </View>
              <Pressable onPress={onCollapseEdit} disabled={busy} style={({ pressed }) => [styles.inlineGhostBtn, pressed && !busy ? styles.inlineGhostBtnPressed : null]}>
                <Text style={styles.inlineGhostBtnText}>Свернуть</Text>
              </Pressable>
            </>
          ) : mode === 'pending' ? (
            <>
              <View style={styles.phonePendingRow}>
                <ActivityIndicator size="small" color={Colors.leaderprod.button} />
                <Text style={styles.phonePendingText}>Идёт привязка телефона...</Text>
                <Pressable
                  onPress={onCancelFlow}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.phoneDangerBtn,
                    pressed && !busy ? styles.phoneDangerBtnPressed : null,
                    busy ? styles.inlineBtnDisabled : null,
                  ]}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              </View>
              {deepLinkUrl ? (
                <Pressable
                  onPress={onOpenMessenger}
                  disabled={busy}
                  style={({ pressed }) => [styles.inlineSecondaryBtn, pressed && !busy ? styles.inlineSecondaryBtnPressed : null]}
                >
                  <Text style={styles.inlineSecondaryBtnText}>Открыть {providerLabel(provider)}</Text>
                </Pressable>
              ) : null}
              {showDesktopQr && qrPayload ? (
                <View style={styles.qrWrap}>
                  <QRCode value={qrPayload} size={180} />
                  <Text style={styles.verifyHint}>Сканируйте QR в {providerLabel(provider)} и отправьте контакт</Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              {hasPhone ? (
                <View style={styles.phoneTop}>
                  <View style={styles.phoneValueRow}>
                    <Text style={styles.infoValue}>{phoneDisplay}</Text>
                    {verified ? <Ionicons name="checkmark-circle" size={18} color="#16A34A" /> : null}
                  </View>
                  {!verified && !canManage ? (
                    <View style={styles.phoneUnverifiedBadge}>
                      <Ionicons name="alert-circle" size={14} color="#B45309" />
                      <Text style={styles.phoneUnverifiedBadgeText}>Не подтвержден</Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.fieldHintText}>Номер телефона не привязан</Text>
              )}
              {canManage ? (
                <Pressable
                  onPress={onStartEdit}
                  style={({ pressed }) => [
                    verified ? styles.yellowPillBtn : styles.phoneActionBtn,
                    pressed ? (verified ? styles.yellowPillBtnPressed : styles.phoneActionBtnPressed) : null,
                  ]}
                >
                  {verified ? <Ionicons name="create-outline" size={14} color={Colors.leaderprod.tint} /> : null}
                  <Text style={verified ? styles.yellowPillBtnText : styles.phoneActionBtnText}>
                    {!hasPhone ? 'Привязать телефон' : verified ? 'Изменить' : 'Подтвердить'}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
          {statusText ? <Text style={styles.inlineNoticeText}>{statusText}</Text> : null}
          {error ? <Text style={styles.inlineErrorText}>{error}</Text> : null}
        </View>
      </View>
    </Animated.View>
  );
}

function InfoCard({
  icon,
  label,
  value,
  delay = 0,
}: {
  icon: IoniconName;
  label: string;
  value?: string;
  delay?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)} layout={Layout.springify()}>
      <View style={styles.infoCard}>
        <View style={styles.infoIcon}>
          <Ionicons name={icon} size={18} color="#4F46E5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue} numberOfLines={2}>
            {value || '—'}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function DepartmentRoleRow({
  department,
  roleName,
  delay = 0,
}: {
  department: string;
  roleName: string;
  delay?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)} layout={Layout.springify()}>
      <View style={styles.deptRow}>
        <View style={styles.deptIcon}>
          <Ionicons name="business-outline" size={18} color="#0EA5E9" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.deptName}>{department}</Text>
          <Text style={styles.deptRole}>Роль: {roleName}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const [hovered, setHovered] = useState(false);
  const onIn = () => (scale.value = withSpring(0.97, { damping: 18, stiffness: 260 }));
  const onOut = () => (scale.value = withSpring(hovered ? 1.03 : 1, { damping: 18, stiffness: 260 }));
  const onHoverIn = () => {
    if (disabled) return;
    setHovered(true);
    scale.value = withSpring(1.03, { damping: 18, stiffness: 260 });
  };
  const onHoverOut = () => {
    if (disabled) return;
    setHovered(false);
    scale.value = withSpring(1, { damping: 18, stiffness: 260 });
  };
  const baseBg = '#FFFFFF';
  const hoverBg = tintColor(baseBg, 0.06);
  const pressBg = shadeColor(baseBg, 0.08);

  return (
    <Animated.View style={[styles.actionBtn, aStyle]}>
      <Pressable
        disabled={disabled}
        onPressIn={onIn}
        onPressOut={onOut}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        onPress={onPress}
        android_ripple={{ color: '#E5E7EB' }}
        style={({ pressed }) => [
          styles.actionPressable,
          disabled && { opacity: 0.5 },
          hovered && !pressed && !disabled ? { backgroundColor: hoverBg } : null,
          pressed && !disabled ? { backgroundColor: pressBg } : null,
        ]}
      >
        <Ionicons name={icon} size={18} color="#111827" />
        <Text style={styles.actionLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function ProfileSkeleton({ showActions }: { showActions?: boolean }) {
  return (
    <View>
      <View style={styles.heroWrap}>
        <View style={[styles.heroInner, { gap: 10 }]}>
          <Skeleton height={96} width={96} radius={28} colorMode="light" />
          <Skeleton height={20} width="60%" radius={6} colorMode="light" />
          <Skeleton height={12} width="40%" radius={6} colorMode="light" />
          <View style={styles.skeletonChipsRow}>
            <Skeleton height={24} width={90} radius={999} colorMode="light" />
            <Skeleton height={24} width={80} radius={999} colorMode="light" />
            <Skeleton height={24} width={110} radius={999} colorMode="light" />
          </View>
        </View>
      </View>

      {showActions ? (
        <View style={styles.actionsRow}>
          <View style={{ flex: 1 }}>
            <Skeleton height={44} radius={12} colorMode="light" width="100%" />
          </View>
          <View style={{ flex: 1 }}>
            <Skeleton height={44} radius={12} colorMode="light" width="100%" />
          </View>
          <View style={{ flex: 1 }}>
            <Skeleton height={44} radius={12} colorMode="light" width="100%" />
          </View>
        </View>
      ) : null}

      <View style={styles.cardsWrap}>
        {[0, 1, 2, 3, 4].map((idx) => (
          <View key={`skeleton-card-${idx}`} style={styles.skeletonCard}>
            <Skeleton height={34} width={34} radius={10} colorMode="light" />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton height={12} width="35%" radius={6} colorMode="light" />
              <Skeleton height={14} width="70%" radius={6} colorMode="light" />
            </View>
          </View>
        ))}
      </View>

      <View style={{ marginTop: 16 }}>
        <Skeleton height={16} width={140} radius={6} colorMode="light" />
        <View style={{ gap: 10, marginTop: 8 }}>
          {[0, 1].map((idx) => (
            <View key={`skeleton-role-${idx}`} style={styles.skeletonCard}>
              <Skeleton height={34} width={34} radius={10} colorMode="light" />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton height={12} width="55%" radius={6} colorMode="light" />
                <Skeleton height={12} width="45%" radius={6} colorMode="light" />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },

  heroWrap: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E7FF',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  heroBg: { ...StyleSheet.absoluteFillObject },
  heroInner: { padding: 18, gap: 8 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  avatarOuter: {
    alignSelf: 'flex-start',
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EEF2FF',
    marginBottom: 10,
  },
  avatar: { width: 88, height: 88, borderRadius: 24 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  avatarInitials: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  avatarEditBadge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', flexShrink: 1 },
  heroSubtitle: { marginTop: 6, color: '#334155' },
  presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  presenceDot: { width: 8, height: 8, borderRadius: 4 },
  presenceText: { color: '#334155', fontSize: 12, fontWeight: '600' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },

  inlineNameEditor: { gap: 8 },
  heroInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
  },
  yellowPillBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FBD38D',
    backgroundColor: '#FFF7E6',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  yellowPillBtnPressed: { backgroundColor: '#FFE8C2' },
  yellowPillBtnText: { fontWeight: '700', color: Colors.leaderprod.tint },
  inlineActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  inlineActionsWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  inlinePrimaryBtn: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: Colors.leaderprod.button,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  inlinePrimaryBtnPressed: { backgroundColor: '#F59E0B' },
  inlinePrimaryBtnText: { color: '#fff', fontWeight: '800' },
  inlineSecondaryBtn: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineSecondaryBtnPressed: { backgroundColor: '#F8FAFC' },
  inlineSecondaryBtnText: { color: '#334155', fontWeight: '700' },
  inlineGhostBtn: {
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineGhostBtnPressed: { backgroundColor: '#F1F5F9' },
  inlineGhostBtnText: { color: '#334155', fontWeight: '600' },
  inlineBtnDisabled: { opacity: 0.65 },
  inlineNoticeText: { color: '#1D4ED8', fontWeight: '600', fontSize: 12 },
  inlineErrorText: { color: '#DC2626', fontSize: 12, fontWeight: '600' },

  chip: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700' },

  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  actionBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  actionPressable: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
  },
  actionLabel: { color: '#111827', fontWeight: '700', fontSize: 13 },

  cardsWrap: { gap: 12 },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  infoLabel: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  infoValue: { color: '#111827', fontSize: 14, fontWeight: '700' },
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
  fieldHintText: { color: '#64748B', fontSize: 12 },
  phoneTop: { gap: 8 },
  phoneValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  phoneActionBtn: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  phoneActionBtnPressed: { backgroundColor: '#F8FAFC' },
  phoneActionBtnText: { color: '#1E293B', fontWeight: '700', fontSize: 12 },
  phoneUnverifiedBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  phoneUnverifiedBadgeText: { color: '#B45309', fontWeight: '700', fontSize: 12 },
  phoneEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phoneInput: { flex: 1 },
  phonePrimaryBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.leaderprod.button,
  },
  phonePrimaryBtnPressed: { backgroundColor: '#F59E0B' },
  phonePendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phonePendingText: { flex: 1, color: '#1E293B', fontWeight: '600', fontSize: 13 },
  phoneDangerBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
  },
  phoneDangerBtnPressed: { backgroundColor: '#B91C1C' },
  qrWrap: {
    marginTop: 6,
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  verifyHint: { fontSize: 12, color: '#64748B', textAlign: 'center' },
  skeletonChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  skeletonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  deptRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deptIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deptName: { color: '#0F172A', fontWeight: '800' },
  deptRole: { color: '#334155', marginTop: 2 },
});

export default ProfileView;
