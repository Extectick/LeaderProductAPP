// app/(auth)/AuthScreen.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import BrandedBackground from '@/components/BrandedBackground';
import FormInput from '@/components/FormInput';
import OTP6Input from '@/components/OTP6Input';
import ShimmerButton from '@/components/ShimmerButton';
import ThemedLoader from '@/components/ui/ThemedLoader';
import { gradientColors } from '@/constants/Colors';
import { AuthContext, isValidProfile } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { API_BASE_URL } from '@/utils/config';
import { login, register, verify } from '@/utils/authService';

/** ─── Module-level cache to defeat StrictMode remounts in dev ─── */
const __authInitCache: {
  initialized: boolean;
  remember: boolean;
  email: string;
  minTopHeight: number | null;
} = (globalThis as any).__authInitCache ?? {
  initialized: false,
  remember: true,
  email: '',
  minTopHeight: null,
};
(Object.assign(globalThis as any, { __authInitCache }));

/** Горизонтальный паддинг карточки (должен совпадать со styles.card.padding) */
const CARD_PAD_H = Platform.OS === 'web' ? 20 : 22;
const { width: winW } = Dimensions.get('window');

/* ───── utils ───── */
const STORAGE_KEYS = {
  REMEMBER_FLAG: '@remember_me',
  REMEMBER_EMAIL: '@remember_email',
} as const;

function validateEmail(email: string) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.toLowerCase());
}
function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}
function passwordScore(pw: string) {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

const ROUTES = {
  HOME: '/home' as Href,
  PROFILE: '/ProfileSelectionScreen' as Href,
} as const;

/* ───── screen ───── */
export default function AuthScreen() {
  const router = useRouter();
  const { setAuthenticated, setProfile } = useContext(AuthContext) || {};

  // равняем вертикаль кнопок между табами
  const [minTopHeight, setMinTopHeight] = useState<number | null>(__authInitCache.minTopHeight);
  const measureRef = useRef({
    login: 0,
    reg: 0,
    locked: __authInitCache.minTopHeight !== null, // если есть кэш — не меряем повторно
  });
  const BTN_HEIGHT = 52;

  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const grad = gradientColors[theme as keyof typeof gradientColors] || gradientColors.light;
  const btnGradient = useMemo(() => [grad[0], grad[1]] as [string, string], [grad]);
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  /* state */
  const [tab, setTab] = useState<0 | 1>(0); // 0=login, 1=register
  const [email, setEmail] = useState(__authInitCache.email);
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [code, setCode] = useState('');
  const [modeVerify, setModeVerify] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(__authInitCache.remember);
  const [loading, setLoading] = useState(false);
  const [bannerError, setBannerError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  // field-level errors (онлайн-валидация)
  const [emailErr, setEmailErr] = useState('');
  const [passErr, setPassErr] = useState('');
  const [passRepeatErr, setPassRepeatErr] = useState('');
  const [codeErr, setCodeErr] = useState('');

  // ширина стабильна — НЕ меряем её onLayout
  const outerW = Math.min(420, winW - 40);
  const pageW = Math.max(0, Math.floor(outerW - CARD_PAD_H * 2));
  const viewportW = pageW;

  /* refs */
  const passRef = useRef<TextInput>(null);
  const passRepeatRef = useRef<TextInput>(null);

  /* anim */
  const sceneX = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const errorShake = useRef(new Animated.Value(0)).current;
  const tabPill = useRef(new Animated.Value(0)).current;

  // fadeIn — один раз
  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // таб-капсула
  useEffect(() => {
    Animated.timing(tabPill, {
      toValue: tab,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    setModeVerify(false);
    setBannerError('');
    Haptics.selectionAsync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // шейк-баннер при ошибке
  useEffect(() => {
    if (!bannerError) return;
    errorShake.setValue(0);
    Animated.sequence([
      Animated.timing(errorShake, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: -1, duration: 70, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [bannerError]);

  // preload remember — делаем строго один раз, с кэшем
  const [preloadReady, setPreloadReady] = useState(__authInitCache.initialized);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (__authInitCache.initialized) {
        // уже инициализировано — ничего не грузим, только убеждаемся что state синхронизирован
        if (!cancelled) setPreloadReady(true);
        return;
      }
      try {
        const remembered = (await AsyncStorage.getItem(STORAGE_KEYS.REMEMBER_FLAG)) === '1';
        const savedEmail = remembered ? await AsyncStorage.getItem(STORAGE_KEYS.REMEMBER_EMAIL) : '';
        if (cancelled) return;
        setRemember(remembered);
        setEmail(savedEmail || '');
        // в кэш тоже
        __authInitCache.remember = remembered;
        __authInitCache.email = savedEmail || '';
      } finally {
        if (!cancelled) {
          __authInitCache.initialized = true;
          setPreloadReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (remember) AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, email);
  }, [email, remember]);

  // запуск анимации ленты, когда preload готов и при смене таба
  useEffect(() => {
    if (!preloadReady) return;
    Animated.timing(sceneX, {
      toValue: -tab * pageW,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadReady, tab]);

  // таймер «отправить повторно»
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  // измерение верхних блоков — один раз, без влияния на лоадер
  const tryLockMinHeight = () => {
    const m = measureRef.current;
    if (!m.locked && m.login > 0 && m.reg > 0) {
      m.locked = true;
      const h = Math.max(m.login, m.reg);
      setMinTopHeight(h);
      __authInitCache.minTopHeight = h; // кэшируем, чтобы dev-ремонты не меряли заново
    }
  };

  /* validators (по вводу) */
  const onEmailChange = (v: string) => {
    setEmail(v);
    if (!v.trim()) setEmailErr('Укажите email');
    else if (!validateEmail(v.trim())) setEmailErr('Некорректный email');
    else setEmailErr('');
  };
  const onPassChange = (v: string) => {
    setPassword(v);
    if (!v) setPassErr('Введите пароль');
    else if (v.length < 6) setPassErr('Минимум 6 символов');
    else setPassErr('');
    if (passwordRepeat) setPassRepeatErr(v === passwordRepeat ? '' : 'Пароли не совпадают');
  };
  const onPassRepeatChange = (v: string) => {
    setPasswordRepeat(v);
    if (!v) setPassRepeatErr('Повторите пароль');
    else if (v !== password) setPassRepeatErr('Пароли не совпадают');
    else setPassRepeatErr('');
  };
  const onCodeChange = (v: string) => {
    const only = v.replace(/[^\d]/g, '').slice(0, 6);
    setCode(only);
    if (only.length !== 6) setCodeErr('Код из 6 цифр');
    else setCodeErr('');
  };

  const canLogin = !emailErr && !passErr && !!email.trim() && !!password;
  const canRegister = !emailErr && !passErr && !passRepeatErr && !!email.trim() && !!password && !!passwordRepeat;

  /* actions */
  const handleLogin = async () => {
    if (!canLogin) {
      if (!email.trim()) setEmailErr('Укажите email');
      if (!password) setPassErr('Введите пароль');
      return;
    }
    const em = normalizeEmail(email);

    if (!setAuthenticated || !setProfile) return setBannerError('Ошибка аутентификации');

    setLoading(true);
    setBannerError('');
    try {
      await login(em, password);
      setAuthenticated(true);

      if (remember) {
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.REMEMBER_FLAG, '1'],
          [STORAGE_KEYS.REMEMBER_EMAIL, em],
        ]);
      } else {
        await AsyncStorage.multiRemove([STORAGE_KEYS.REMEMBER_FLAG, STORAGE_KEYS.REMEMBER_EMAIL]);
      }

      const profileJson = await AsyncStorage.getItem('profile');
      if (profileJson) {
        const profile = JSON.parse(profileJson);
        await setProfile(profile);
        isValidProfile(profile) ? router.replace(ROUTES.HOME) : router.replace(ROUTES.PROFILE);
      } else {
        // Профиль не пришел в ответе — очищаем и отправляем на создание
        await AsyncStorage.removeItem('profile');
        await setProfile(null);
        router.replace(ROUTES.PROFILE);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setBannerError(
        e?.message?.includes('Не удалось обновить токен') ? 'Неверный email или пароль' : e?.message || 'Ошибка при входе'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!canRegister) {
      if (!email.trim()) setEmailErr('Укажите email');
      if (!password) setPassErr('Введите пароль');
      if (!passwordRepeat) setPassRepeatErr('Повторите пароль');
      return;
    }
    const em = normalizeEmail(email);

    setLoading(true);
    setBannerError('');
    try {
      await register(em, password, em.split('@')[0]);
      setModeVerify(true);
      Haptics.selectionAsync();
      if (remember) {
        await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, em);
        await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_FLAG, '1');
      }
    } catch (e: any) {
      setBannerError(e?.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyWith = async (otp: string) => {
    if (!otp || otp.length !== 6) return;
    setLoading(true);
    setBannerError('');
    try {
      const verifiedProfile = await verify(email, otp);
      if (setAuthenticated) setAuthenticated(true);
      if (setProfile) await setProfile(verifiedProfile ?? null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(ROUTES.PROFILE);
    } catch (e: any) {
      setBannerError(e?.message || 'Ошибка подтверждения');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setBannerError('');
    setResendTimer(30); // старт нового отсчёта
    try {
      await Haptics.selectionAsync();
      // TODO: вызовите ваш API: await resendVerification(email)
    } catch {
      setBannerError('Не удалось отправить код. Попробуйте позже.');
    }
  };

  const handlePasteOTP = async () => {
    try {
      const str = await Clipboard.getStringAsync();
      const only = (str || '').replace(/\D/g, '').slice(0, 6);
      if (!only) return;
      setCode(only); // OTP6Input получит value и сам вызовет onFilled
      Haptics.selectionAsync();
    } catch {
      setBannerError('Не удалось получить текст из буфера');
    }
  };

  /* derived */
  const ps = passwordScore(password);
  const pillWidth = Math.min(420, winW - 40) / 2 - 6;
  const pillTranslate = tabPill.interpolate({ inputRange: [0, 1], outputRange: [4, 8 + pillWidth] });
  const versionLabel = Constants.expoConfig?.version ?? 'unknown';

  // маленькая анимируемая кнопка для Verify
  const MiniButton: React.FC<{
    title: string;
    onPress: () => void;
    variant?: 'filled' | 'outline';
    disabled?: boolean;
  }> = ({ title, onPress, variant = 'filled', disabled }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const pressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, friction: 5 }).start();
    const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    return (
      <Animated.View style={{ transform: [{ scale }], flexGrow: 1 }}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPressIn={pressIn}
          onPressOut={pressOut}
          onPress={onPress}
          disabled={disabled}
          style={[
            {
              height: 44,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 14,
              marginVertical: 4,
            },
            variant === 'filled'
              ? { backgroundColor: colors.tint }
              : { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
          ]}
        >
          <Text style={{ color: variant === 'filled' ? colors.buttonText : colors.text, fontWeight: '700' }}>{title}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // РЕНДЕР
  return (
    <BrandedBackground speed={1.5}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.top}
        >
          {/* Оверлей-лоадер: только пока идёт preload из AsyncStorage ПЕРВЫЙ раз */}
          {!preloadReady && (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center', zIndex: 10 }]}
            >
              <ThemedLoader size={72} stroke={3} />
            </View>
          )}

          {/* Форма всегда монтируется */}
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <Animated.View style={[styles.header, { opacity: fadeIn }]}>
              {/* { Позже сюда добавить header и лого} */}
              <Text style={styles.brand}></Text>
            </Animated.View>

            {/* Tabs */}
            {!modeVerify && (
              <View style={styles.segmentWrapper}>
                <View style={styles.segment}>
                  <Animated.View
                    style={[styles.segmentPill, { width: pillWidth, transform: [{ translateX: pillTranslate }] }]}
                  />
                  <TouchableOpacity style={styles.segmentBtn} activeOpacity={0.85} onPress={() => setTab(0)}>
                    <Text style={[styles.segmentText, tab === 0 && styles.segmentTextActive]}>Вход</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.segmentBtn} activeOpacity={0.85} onPress={() => setTab(1)}>
                    <Text style={[styles.segmentText, tab === 1 && styles.segmentTextActive]}>Регистрация</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Error banner */}
            {!!bannerError && (
              <Animated.View
                style={[
                  styles.errorWrap,
                  {
                    transform: [
                      { translateX: errorShake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-8, 0, 8] }) },
                    ],
                  },
                ]}
              >
                <Text style={styles.errorText}>{bannerError}</Text>
              </Animated.View>
            )}

            {/* Card */}
            <Animated.View
              style={[
                styles.card,
                {
                  width: '100%',
                  maxWidth: 420,
                  opacity: fadeIn,
                  transform: [{ translateY: fadeIn.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
                },
              ]}
            >
              {!modeVerify ? (
                // ---- viewport с жёстким клипом по внутренней ширине карточки ----
                <View style={{ width: viewportW, alignSelf: 'center', overflow: 'hidden' }}>
                  <Animated.View
                    style={{
                      width: viewportW * 2,
                      flexDirection: 'row',
                      transform: [{ translateX: sceneX }],
                    }}
                  >
                    {/* LOGIN */}
                    <View style={[styles.slide, { width: viewportW }]}>
                      <Text style={styles.title}>Вход</Text>

                      {/* фиксированная minHeight только для выравнивания кнопок между табами */}
                      <View style={[styles.topBlock, { minHeight: minTopHeight ?? undefined }]}>
                        <View
                          onLayout={(e) => {
                            if (measureRef.current.locked) return;
                            measureRef.current.login = Math.round(e.nativeEvent.layout.height);
                            tryLockMinHeight();
                          }}
                        >
                          <View style={styles.fieldCompact}>
                            <FormInput
                              size="xs"
                              noMargin
                              label="Email"
                              value={email}
                              onChangeText={onEmailChange}
                              onBlur={() => setEmail((prev) => normalizeEmail(prev))}
                              placeholder="your@email.com"
                              autoCapitalize="none"
                              autoCorrect={false}
                              keyboardType="email-address"
                              textContentType="emailAddress"
                              autoComplete="email"
                              returnKeyType="next"
                              onSubmitEditing={() => passRef.current?.focus()}
                              editable={!loading}
                              error={emailErr || undefined}
                            />
                          </View>

                          <View style={styles.fieldCompact}>
                            <FormInput
                              size="xs"
                              noMargin
                              label="Пароль"
                              ref={passRef}
                              value={password}
                              onChangeText={onPassChange}
                              placeholder="••••••••"
                              secureTextEntry={!showPassword}
                              autoCapitalize="none"
                              autoCorrect={false}
                              textContentType="password"
                              autoComplete="password"
                              returnKeyType="done"
                              onSubmitEditing={handleLogin}
                              rightIcon={showPassword ? 'eye-off' : 'eye'}
                              onIconPress={() => setShowPassword((p) => !p)}
                              editable={!loading}
                              error={passErr || undefined}
                            />
                          </View>

                          <View style={styles.rowBetween}>
                            <TouchableOpacity activeOpacity={0.7} style={styles.forgotLink}>
                              <Text style={[styles.linkText, { color: grad[0] }]}>Забыли пароль?</Text>
                            </TouchableOpacity>
                            <View style={styles.rememberRight}>
                              <Switch
                                value={remember}
                                onValueChange={async (v) => {
                                  setRemember(v);
                                  Haptics.selectionAsync();
                                  if (v) {
                                    await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_FLAG, '1');
                                    await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, normalizeEmail(email));
                                  } else {
                                    await AsyncStorage.multiRemove([STORAGE_KEYS.REMEMBER_FLAG, STORAGE_KEYS.REMEMBER_EMAIL]);
                                  }
                                }}
                              />
                              <Text style={styles.rememberText}>Запомнить</Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      <View style={styles.buttonWrap}>
                        <ShimmerButton
                          title="Войти"
                          onPress={handleLogin}
                          loading={loading}
                          haptics
                          gradientColors={btnGradient}
                          style={{ height: BTN_HEIGHT }}
                        />
                      </View>
                    </View>

                    {/* REGISTER */}
                    <View style={[styles.slide, { width: viewportW }]}>
                      <Text style={styles.title}>Создать аккаунт ✨</Text>

                      <View style={[styles.topBlock, { minHeight: minTopHeight ?? undefined }]}>
                        <View
                          onLayout={(e) => {
                            if (measureRef.current.locked) return;
                            measureRef.current.reg = Math.round(e.nativeEvent.layout.height);
                            tryLockMinHeight();
                          }}
                        >
                          <View style={styles.fieldCompact}>
                            <FormInput
                              size="xs"
                              noMargin
                              label="Email"
                              value={email}
                              onChangeText={onEmailChange}
                              onBlur={() => setEmail((prev) => normalizeEmail(prev))}
                              placeholder="you@domain.com"
                              autoCapitalize="none"
                              autoCorrect={false}
                              keyboardType="email-address"
                              textContentType="emailAddress"
                              autoComplete="email"
                              returnKeyType="next"
                              onSubmitEditing={() => passRef.current?.focus()}
                              editable={!loading}
                              error={emailErr || undefined}
                            />
                          </View>

                          <View style={styles.fieldCompact}>
                            <FormInput
                              size="xs"
                              noMargin
                              label="Пароль"
                              ref={passRef}
                              value={password}
                              onChangeText={onPassChange}
                              placeholder="Минимум 6 символов"
                              secureTextEntry={!showPassword}
                              autoCapitalize="none"
                              autoCorrect={false}
                              textContentType="newPassword"
                              autoComplete="password-new"
                              returnKeyType="next"
                              onSubmitEditing={() => passRepeatRef.current?.focus()}
                              rightIcon={showPassword ? 'eye-off' : 'eye'}
                              onIconPress={() => setShowPassword((p) => !p)}
                              editable={!loading}
                              error={passErr || undefined}
                            />
                          </View>

                          {!!password && (
                            <View style={styles.strengthRow}>
                              <View style={styles.strengthBg}>
                                <View
                                  style={[
                                    styles.strengthFill,
                                    { width: `${(ps / 4) * 100}%`, backgroundColor: grad[0] },
                                  ]}
                                />
                              </View>
                              <Text style={[styles.secondary, { marginLeft: 8 }]}>
                                {['Очень слабый', 'Слабый', 'Средний', 'Хороший', 'Сильный'][ps]}
                              </Text>
                            </View>
                          )}

                          <View style={styles.fieldCompact}>
                            <FormInput
                              size="xs"
                              noMargin
                              label="Повторите пароль"
                              ref={passRepeatRef}
                              value={passwordRepeat}
                              onChangeText={onPassRepeatChange}
                              placeholder="Повторите пароль"
                              secureTextEntry={!showPassword}
                              autoCapitalize="none"
                              autoCorrect={false}
                              textContentType="password"
                              autoComplete="password"
                              returnKeyType="done"
                              onSubmitEditing={handleRegister}
                              editable={!loading}
                              error={passRepeatErr || undefined}
                            />
                          </View>
                        </View>
                      </View>

                      <View style={styles.buttonWrap}>
                        <ShimmerButton
                          title="Зарегистрироваться"
                          onPress={handleRegister}
                          loading={loading}
                          haptics
                          gradientColors={btnGradient}
                          style={{ height: BTN_HEIGHT }}
                        />
                      </View>
                    </View>
                  </Animated.View>
                </View>
              ) : (
                /* VERIFY */
                <View style={{ width: '100%' }}>
                  <Text style={styles.title}>Подтверждение 📩</Text>
                  <Text style={[styles.secondary, { textAlign: 'center', marginBottom: 12 }]}>
                    Введите 6-значный код, отправленный на {email}
                  </Text>

                  {/* Адаптивный OTP-ввод */}
                  <OTP6Input
                    value={code}
                    onChange={(v) => setCode(v)}
                    onFilled={(v) => handleVerifyWith(v)}   // авто-отправка при 6 цифрах
                    disabled={loading}
                    error={!!codeErr}
                    secure={false}
                  />

                  {/* Кнопки действий */}
                  <View style={styles.otpActionsRow}>
                    <MiniButton title="Вставить" onPress={handlePasteOTP} variant="filled" />
                    {resendTimer > 0 ? (
                      <View style={styles.timerPill}>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>{`Повторно через ${resendTimer} c`}</Text>
                      </View>
                    ) : (
                      <MiniButton title="Отправить повторно" onPress={handleResendCode} variant="outline" />
                    )}
                    <MiniButton title="Назад" onPress={() => setModeVerify(false)} variant="outline" />
                  </View>
                </View>
              )}
            </Animated.View>

            <View style={styles.buildInfo}>
              <Text style={styles.buildInfoText}>API: {API_BASE_URL || 'не задан'}</Text>
              <Text style={styles.buildInfoText}>Версия приложения: v{versionLabel}</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </BrandedBackground>
  );
}

/* ───── styles ───── */
const getStyles = (colors: {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  inputBackground: string;
  inputBorder: string;
  button: string;
  buttonText: string;
  buttonDisabled: string;
  secondaryText: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  disabledText: string;
  disabledBackground: string;
  cardBackground: string;
  placeholder: string;
  shadow: string;
  expired: string;
  card: string;
  border: string;
}) =>
  StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 0,
    },
    header: {
      width: '100%',
      maxWidth: Platform.OS === 'web' ? 820 : 620,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    brand: { fontSize: 24, fontWeight: '800', letterSpacing: 0.5, color: colors.text },

    segmentWrapper: { width: '100%', alignItems: 'center', marginBottom: 10 },
    segment: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: 'rgba(255,255,255,0.7)',
      borderRadius: 16,
      padding: 4,
      flexDirection: 'row',
      overflow: 'hidden',
      ...Platform.select({ web: { backdropFilter: 'blur(8px)' } }),
    },
    segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    segmentText: { fontWeight: '700', color: '#4b5563' },
    segmentTextActive: { color: '#111827' },
    segmentPill: { position: 'absolute', top: 4, bottom: 4, borderRadius: 12, backgroundColor: '#fff' },

    errorWrap: {
      maxWidth: 420,
      width: '100%',
      backgroundColor: `${colors.error}22`,
      borderColor: colors.error,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      marginBottom: 10,
    },
    errorText: { color: colors.error, textAlign: 'center', fontWeight: '700' },

    topBlock: {
      justifyContent: 'flex-start',
    },
    card: {
      backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.85)' : colors.cardBackground,
      borderRadius: 20,
      padding: CARD_PAD_H,
      overflow: 'hidden',
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

    slide: { paddingBottom: 4, paddingHorizontal: 0 },

    title: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 14 },

    fieldCompact: { width: '100%', alignSelf: 'stretch', marginBottom: 10 },

    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
      marginBottom: 10,
    },
    forgotLink: { flex: 1 },

    rememberRight: { flexDirection: 'row', alignItems: 'center' },
    rememberText: { marginLeft: 8, color: colors.secondaryText, fontSize: 14 },

    buttonWrap: {
      width: '100%',
      alignSelf: 'stretch',
      overflow: 'hidden',
      borderRadius: 16,
      marginTop: 6,
    },
    fill: { flex: 1 },
    linkText: {
      fontSize: 14,
      fontWeight: '700',
      textDecorationLine: 'underline',
      color: colors.tint,
    },

    secondary: { color: colors.secondaryText, fontSize: 14 },

    strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: -4, marginBottom: 8 },
    strengthBg: { height: 8, backgroundColor: '#00000020', borderRadius: 6, flex: 1, overflow: 'hidden' },
    strengthFill: { height: 8, borderRadius: 6 },

    otpActionsRow: {
      width: '100%',
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      flexWrap: 'wrap',
    },
    timerPill: {
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'transparent',
      flexGrow: 1,
    },
    buildInfo: {
      marginTop: 12,
      marginBottom: 10,
      width: '100%',
      alignItems: 'center',
      gap: 2,
    },
    buildInfoText: { fontSize: 12, color: colors.secondaryText, opacity: 0.8, textAlign: 'center' },
  });
