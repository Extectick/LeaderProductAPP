// app/(auth)/AuthScreen.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  StyleProp,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import BrandedBackground from '@/components/BrandedBackground';
import FormInput from '@/components/FormInput';
import OTP6Input from '@/components/OTP6Input';
import ShimmerButton from '@/components/ShimmerButton';
import ThemedLoader from '@/components/ui/ThemedLoader';
import { gradientColors } from '@/constants/Colors';
import { AuthContext } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { API_BASE_URL } from '@/utils/config';
import { shadeColor, tintColor } from '@/utils/color';
import {
  changePassword,
  login,
  register,
  resendVerification,
  requestPasswordReset,
  verify,
  verifyPasswordReset,
} from '@/utils/authService';
import { getProfileGate } from '@/utils/profileGate';
import { applyWebAutofillFix } from '@/utils/webAutofillFix';

/** ─── Module-level cache to defeat StrictMode remounts in dev ─── */
const __authInitCache: {
  initialized: boolean;
  remember: boolean;
  email: string;
  password: string;
  minTopHeight: number | null;
} = (globalThis as any).__authInitCache ?? {
  initialized: false,
  remember: true,
  email: '',
  password: '',
  minTopHeight: null,
};
(Object.assign(globalThis as any, { __authInitCache }));

/** Горизонтальный паддинг карточки (должен совпадать со styles.card.padding) */
const CARD_PAD_H = Platform.OS === 'web' ? 20 : 22;
const APP_LOGO = require('../../assets/images/icon.png');

/* ───── utils ───── */
const STORAGE_KEYS = {
  REMEMBER_FLAG: '@remember_me',
  REMEMBER_EMAIL: '@remember_email',
  REMEMBER_PASSWORD: '@remember_password',
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
  PENDING: '/(auth)/ProfilePendingScreen' as Href,
  BLOCKED: '/(auth)/ProfileBlockedScreen' as Href,
} as const;

function normalizeError(err: any): string {
  const raw = err?.message || (typeof err === 'string' ? err : '');
  if (/network request failed|failed to fetch|network error/i.test(raw)) {
    return 'Нет соединения с сервером';
  }
  return raw || 'Произошла ошибка. Попробуйте снова.';
}

/* ───── screen ───── */
export default function AuthScreen() {
  const router = useRouter();
  const { setAuthenticated, setProfile } = useContext(AuthContext) || {};

  // равняем вертикаль кнопок между табами
  const [minTopHeight, setMinTopHeight] = useState<number | null>(
    Platform.OS === 'web' ? null : __authInitCache.minTopHeight
  );
  const measureRef = useRef({
    login: 0,
    reg: 0,
    locked: Platform.OS !== 'web' && __authInitCache.minTopHeight !== null, // web всегда меряем заново
  });

  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const grad = gradientColors[theme as keyof typeof gradientColors] || gradientColors.light;
  const btnGradient = useMemo(() => [grad[0], grad[1]] as [string, string], [grad]);
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWebMobile = isWeb && winW < 768;
  const isNativeMobile = !isWeb && winW < 700;
  const isWebTablet = isWeb && winW >= 768 && winW < 1280;
  const alignTopLayout = isWeb && !isWebMobile && winH < 820;
  const fieldSize = isWeb ? (isWebMobile ? 'xs' : 'sm') : 'xs';
  const BTN_HEIGHT = isWeb ? (isWebMobile ? 52 : 56) : 52;
  const cardPadH = isWeb ? (isWebMobile ? 14 : isWebTablet ? 20 : 22) : CARD_PAD_H;
  const cardPadV = isWeb ? (isWebMobile ? 14 : isWebTablet ? 18 : 20) : CARD_PAD_H;
  const contentPadH = isWeb ? (isWebMobile ? 12 : isWebTablet ? 20 : 24) : 20;
  const contentPadTop = isWeb ? (alignTopLayout ? 12 : 24) : 0;
  const contentPadBottom = isWeb ? (isWebMobile ? 24 : 32) + insets.bottom : 0;
  const ctaTextStyle = isWeb
    ? { fontSize: isWebMobile ? 17 : 18, lineHeight: isWebMobile ? 21 : 24 }
    : undefined;
  const loginFooterSpacingStyle = isWebMobile
    ? { marginTop: 4, marginBottom: 6, gap: 8 }
    : isNativeMobile
    ? { marginTop: 4, marginBottom: 4 }
    : undefined;

  useEffect(() => {
    if (Platform.OS === 'web') {
      applyWebAutofillFix(colors.inputBackground, colors.text);
    }
  }, [colors.inputBackground, colors.text]);

  /* state */
  const [tab, setTab] = useState<0 | 1>(0); // 0=login, 1=register
  const [email, setEmail] = useState(__authInitCache.email);
  const [password, setPassword] = useState(__authInitCache.password);
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [code, setCode] = useState('');
  const [modeVerify, setModeVerify] = useState(false);
  const [modeReset, setModeReset] = useState(false);
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordRepeat, setResetPasswordRepeat] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(__authInitCache.remember);
  const [loading, setLoading] = useState(false);
  const [bannerError, setBannerError] = useState('');
  const [bannerNotice, setBannerNotice] = useState('');
  const [bannerNoticeTone, setBannerNoticeTone] = useState<'success' | 'info'>('success');
  const [resendTimer, setResendTimer] = useState(0);
  const [resetResendTimer, setResetResendTimer] = useState(0);

  // field-level errors (онлайн-валидация)
  const [emailErr, setEmailErr] = useState('');
  const [passErr, setPassErr] = useState('');
  const [passRepeatErr, setPassRepeatErr] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [resetEmailErr, setResetEmailErr] = useState('');
  const [resetCodeErr, setResetCodeErr] = useState('');
  const [resetPassErr, setResetPassErr] = useState('');
  const [resetPassRepeatErr, setResetPassRepeatErr] = useState('');

  // ширина стабильна — НЕ меряем её onLayout
  const maxFormWidth = isWeb ? (isWebMobile ? 520 : isWebTablet ? 700 : 470) : 420;
  const outerW = Math.max(0, Math.min(maxFormWidth, winW - contentPadH * 2));
  const pageW = Math.max(0, Math.floor(outerW - cardPadH * 2));
  const viewportW = pageW;
  const logoWrapSize = Math.round(Math.min(Math.max(outerW * 0.34, 104), isWeb ? 156 : 148));
  const logoSize = Math.round(logoWrapSize * 0.78);

  /* refs */
  const passRef = useRef<TextInput>(null);
  const passRepeatRef = useRef<TextInput>(null);
  const verifyInFlight = useRef(false);
  const lastVerifyCode = useRef('');
  const resetVerifyInFlight = useRef(false);
  const lastResetVerifyCode = useRef('');

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
    setModeReset(false);
    setResetStep(0);
    setResetCode('');
    setResetResendTimer(0);
    setBannerError('');
    setBannerNotice('');
    Haptics.selectionAsync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // шейк-баннер при ошибке
  useEffect(() => {
    if (!bannerError) return;
    setBannerNotice('');
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
        const savedPassword = remembered ? await AsyncStorage.getItem(STORAGE_KEYS.REMEMBER_PASSWORD) : '';
        if (cancelled) return;
        setRemember(remembered);
        setEmail(savedEmail || '');
        setPassword(savedPassword || '');
        // в кэш тоже
        __authInitCache.remember = remembered;
        __authInitCache.email = savedEmail || '';
        __authInitCache.password = savedPassword || '';
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
    if (remember) {
      AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, email);
      __authInitCache.email = email;
    }
  }, [email, remember]);

  useEffect(() => {
    if (remember) {
      AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_PASSWORD, password);
      __authInitCache.password = password;
    }
  }, [password, remember]);

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
  }, [preloadReady, tab, pageW]);

  // таймер «отправить повторно»
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  useEffect(() => {
    if (resetResendTimer <= 0) return;
    const t = setTimeout(() => setResetResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resetResendTimer]);

  useEffect(() => {
    if (code.length < 6) lastVerifyCode.current = '';
  }, [code]);

  useEffect(() => {
    if (resetCode.length < 6) lastResetVerifyCode.current = '';
  }, [resetCode]);

  useEffect(() => {
    if (!modeVerify) {
      lastVerifyCode.current = '';
      verifyInFlight.current = false;
    }
  }, [modeVerify]);

  useEffect(() => {
    if (!modeReset) {
      lastResetVerifyCode.current = '';
      resetVerifyInFlight.current = false;
    }
  }, [modeReset]);

  // измерение верхних блоков — один раз, без влияния на лоадер
  const tryLockMinHeight = () => {
    const m = measureRef.current;
    if (!m.locked && m.login > 0 && m.reg > 0) {
      m.locked = true;
      const h = Math.max(m.login, m.reg);
      setMinTopHeight(h);
      if (!isWeb) {
        __authInitCache.minTopHeight = h; // кэшируем только для натива
      }
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
    if (only.length && only.length !== 6) setCodeErr('Код из 6 цифр');
    else setCodeErr('');
  };

  const onResetEmailChange = (v: string) => {
    setResetEmail(v);
    if (!v.trim()) setResetEmailErr('Укажите email');
    else if (!validateEmail(v.trim())) setResetEmailErr('Некорректный email');
    else setResetEmailErr('');
  };
  const onResetCodeChange = (v: string) => {
    const only = v.replace(/[^\d]/g, '').slice(0, 6);
    setResetCode(only);
    if (only.length && only.length !== 6) setResetCodeErr('Код из 6 цифр');
    else setResetCodeErr('');
  };
  const onResetPassChange = (v: string) => {
    setResetPassword(v);
    if (!v) setResetPassErr('Введите пароль');
    else if (v.length < 6) setResetPassErr('Минимум 6 символов');
    else setResetPassErr('');
    if (resetPasswordRepeat) setResetPassRepeatErr(v === resetPasswordRepeat ? '' : 'Пароли не совпадают');
  };
  const onResetPassRepeatChange = (v: string) => {
    setResetPasswordRepeat(v);
    if (!v) setResetPassRepeatErr('Повторите пароль');
    else if (v !== resetPassword) setResetPassRepeatErr('Пароли не совпадают');
    else setResetPassRepeatErr('');
  };

  const canLogin = !emailErr && !passErr && !!email.trim() && !!password;
  const canRegister = !emailErr && !passErr && !passRepeatErr && !!email.trim() && !!password && !!passwordRepeat;

  /* actions */
  const handleLogin = async () => {
    if (!canLogin) {
      if (!email.trim()) setEmailErr('Укажите email');
      if (!password) setPassErr('Введите пароль');
      setBannerError('Проверьте обязательные поля');
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
        __authInitCache.remember = true;
        __authInitCache.email = em;
        __authInitCache.password = password;
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.REMEMBER_FLAG, '1'],
          [STORAGE_KEYS.REMEMBER_EMAIL, em],
          [STORAGE_KEYS.REMEMBER_PASSWORD, password],
        ]);
      } else {
        __authInitCache.remember = false;
        __authInitCache.email = '';
        __authInitCache.password = '';
        await AsyncStorage.multiRemove([
          STORAGE_KEYS.REMEMBER_FLAG,
          STORAGE_KEYS.REMEMBER_EMAIL,
          STORAGE_KEYS.REMEMBER_PASSWORD,
        ]);
      }

      const profileJson = await AsyncStorage.getItem('profile');
      if (profileJson) {
        const profile = JSON.parse(profileJson);
        await setProfile(profile);
        const gate = getProfileGate(profile);
        if (gate === 'active') router.replace(ROUTES.HOME);
        else if (gate === 'pending') router.replace(ROUTES.PENDING);
        else if (gate === 'blocked') router.replace(ROUTES.BLOCKED);
        else router.replace(ROUTES.PROFILE);
      } else {
        // Профиль не пришел в ответе — очищаем и отправляем на создание
        await AsyncStorage.removeItem('profile');
        await setProfile(null);
        router.replace(ROUTES.PROFILE);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      const msg = normalizeError(e);
      setBannerError(
        msg.includes('обновить токен') ? 'Неверный email или пароль' : msg
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
      setBannerError('Проверьте обязательные поля');
      return;
    }
    const em = normalizeEmail(email);

    setLoading(true);
    setBannerError('');
    try {
      await register(em, password, em.split('@')[0]);
      setEmail(em);
      setCode('');
      setCodeErr('');
      setModeReset(false);
      setModeVerify(true);
      setResendTimer(30);
      Haptics.selectionAsync();
      if (remember) {
        await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, em);
        await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_FLAG, '1');
      }
    } catch (e: any) {
      setBannerError(normalizeError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyWith = async (otp: string) => {
    const trimmed = String(otp || '').trim();
    try {
      if (trimmed.length !== 6) return;
      const em = normalizeEmail(email);
      if (!validateEmail(em)) {
        setBannerError('Некорректный email');
        return;
      }
      if (verifyInFlight.current) return;
      if (lastVerifyCode.current === trimmed) return;

      verifyInFlight.current = true;
      lastVerifyCode.current = trimmed;
      setLoading(true);
      setBannerError('');
      setEmail(em);
      const verifiedProfile = await verify(em, trimmed);
      setCodeErr('');
      if (setAuthenticated) setAuthenticated(true);
      if (setProfile) await setProfile(verifiedProfile ?? null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const gate = getProfileGate(verifiedProfile ?? null);
      if (gate === 'active') router.replace(ROUTES.HOME);
      else if (gate === 'pending') router.replace(ROUTES.PENDING);
      else if (gate === 'blocked') router.replace(ROUTES.BLOCKED);
      else router.replace(ROUTES.PROFILE);
    } catch (e: any) {
      const msg = normalizeError(e);
      setBannerError(msg);
      if (trimmed.length === 6) {
        setCodeErr(/код|code/i.test(msg) ? msg : 'Неверный код подтверждения');
      }
    } finally {
      verifyInFlight.current = false;
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setBannerError('');
    setBannerNotice('');
    try {
      const em = normalizeEmail(email);
      if (!validateEmail(em)) {
        setBannerError('Некорректный email');
        return;
      }
      setEmail(em);
      await Haptics.selectionAsync();
      await resendVerification(em);
      setCode('');
      setCodeErr('');
      setResendTimer(30); // старт нового отсчёта
      setBannerNoticeTone('success');
      setBannerNotice('Код подтверждения отправлен повторно.');
    } catch (e: any) {
      setBannerError(normalizeError(e));
    }
  };

  const handlePasteOTP = async () => {
    try {
      const str = await Clipboard.getStringAsync();
      const only = (str || '').replace(/\D/g, '').slice(0, 6);
      if (!only) return;
      setCode(only); // OTP6Input получит value и сам вызовет onFilled
      setCodeErr(only.length === 6 ? '' : 'Код из 6 цифр');
      Haptics.selectionAsync();
    } catch {
      setBannerError('Не удалось получить текст из буфера');
    }
  };

  const handleRememberToggle = async (v: boolean) => {
    setRemember(v);
    Haptics.selectionAsync();
    if (v) {
      __authInitCache.remember = true;
      await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_FLAG, '1');
      await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, normalizeEmail(email));
      await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_PASSWORD, password);
    } else {
      __authInitCache.remember = false;
      __authInitCache.email = '';
      __authInitCache.password = '';
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.REMEMBER_FLAG,
        STORAGE_KEYS.REMEMBER_EMAIL,
        STORAGE_KEYS.REMEMBER_PASSWORD,
      ]);
    }
  };

  const openResetFlow = () => {
    setModeVerify(false);
    setModeReset(true);
    setResetStep(0);
    setBannerError('');
    setBannerNotice('');
    const em = email.trim() ? normalizeEmail(email) : '';
    setResetEmail(em);
    setResetEmailErr(em && validateEmail(em) ? '' : em ? 'Некорректный email' : '');
    setResetCode('');
    setResetCodeErr('');
    setResetPassword('');
    setResetPasswordRepeat('');
    setShowResetPassword(false);
    setResetPassErr('');
    setResetPassRepeatErr('');
    setResetResendTimer(0);
  };

  const handleResetRequest = async () => {
    const em = normalizeEmail(resetEmail || '');
    if (!em) {
      setResetEmailErr('Укажите email');
      return;
    }
    if (!validateEmail(em)) {
      setResetEmailErr('Некорректный email');
      return;
    }
    setResetEmailErr('');
    setLoading(true);
    setBannerError('');
    try {
      setResetEmail(em);
      await requestPasswordReset(em);
      setResetCode('');
      setResetCodeErr('');
      setResetStep(1);
      setResetResendTimer(30);
      await Haptics.selectionAsync();
    } catch (e: any) {
      setBannerError(normalizeError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResetVerifyWith = async (otp: string) => {
    const trimmed = String(otp || '').trim();
    try {
      if (trimmed.length !== 6) {
        setResetCodeErr('Код из 6 цифр');
        return;
      }
      const em = normalizeEmail(resetEmail || '');
      if (!validateEmail(em)) {
        setResetEmailErr('Некорректный email');
        return;
      }
      if (resetVerifyInFlight.current) return;
      if (lastResetVerifyCode.current === trimmed) return;

      resetVerifyInFlight.current = true;
      lastResetVerifyCode.current = trimmed;
      setResetEmailErr('');
      setResetCodeErr('');
      setLoading(true);
      setBannerError('');
      setResetEmail(em);
      await verifyPasswordReset(em, trimmed);
      setResetCode(otp);
      setResetCodeErr('');
      setResetStep(2);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      const msg = normalizeError(e);
      setBannerError(msg);
      if (trimmed.length === 6) {
        setResetCodeErr(/код|code/i.test(msg) ? msg : 'Неверный код');
      }
    } finally {
      resetVerifyInFlight.current = false;
      setLoading(false);
    }
  };

  const handleResetResendCode = async () => {
    const em = normalizeEmail(resetEmail || '');
    if (!validateEmail(em)) {
      setResetEmailErr('Некорректный email');
      return;
    }
    setResetEmailErr('');
    setBannerError('');
    setBannerNotice('');
    try {
      setResetEmail(em);
      await requestPasswordReset(em);
      setResetCode('');
      setResetCodeErr('');
      setResetResendTimer(30);
      await Haptics.selectionAsync();
      setBannerNoticeTone('success');
      setBannerNotice('Код для сброса пароля отправлен повторно.');
    } catch (e: any) {
      setBannerError(normalizeError(e));
    }
  };

  const handleResetChange = async () => {
    if (!resetCode || resetCode.length !== 6) {
      setResetCodeErr('Код из 6 цифр');
      setResetStep(1);
      return;
    }
    if (!resetPassword) {
      setResetPassErr('Введите пароль');
      return;
    }
    if (resetPassword.length < 6) {
      setResetPassErr('Минимум 6 символов');
      return;
    }
    if (!resetPasswordRepeat) {
      setResetPassRepeatErr('Повторите пароль');
      return;
    }
    if (resetPasswordRepeat !== resetPassword) {
      setResetPassRepeatErr('Пароли не совпадают');
      return;
    }

    const em = normalizeEmail(resetEmail || '');
    if (!validateEmail(em)) {
      setResetEmailErr('Некорректный email');
      return;
    }

    setLoading(true);
    setBannerError('');
    try {
      setResetEmail(em);
      await changePassword(em, resetCode, resetPassword);
      setModeReset(false);
      setResetStep(0);
      setResetEmail('');
      setResetCode('');
      setResetPassword('');
      setResetPasswordRepeat('');
      setShowResetPassword(false);
      setResetPassErr('');
      setResetPassRepeatErr('');
      setResetCodeErr('');
      setResetResendTimer(0);
      setTab(0);
      setPassword('');
      setPasswordRepeat('');
      setShowPassword(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setBannerError(normalizeError(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePasteResetOTP = async () => {
    try {
      const str = await Clipboard.getStringAsync();
      const only = (str || '').replace(/\D/g, '').slice(0, 6);
      if (!only) return;
      setResetCode(only);
      setResetCodeErr(only.length === 6 ? '' : 'Код из 6 цифр');
      Haptics.selectionAsync();
    } catch {
      setBannerError('Не удалось получить текст из буфера');
    }
  };

  /* derived */
  const ps = passwordScore(password);
  const pillWidth = Math.max(0, outerW / 2 - 6);
  const pillTranslate = tabPill.interpolate({ inputRange: [0, 1], outputRange: [4, 8 + pillWidth] });
  const versionLabel = (
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    'unknown'
  )
    .toString()
    .trim() || 'unknown';
  const apiDisplay = API_BASE_URL || 'не задан';
  const noticePalette =
    bannerNoticeTone === 'success'
      ? { bg: `${colors.success}22`, border: colors.success, text: colors.success }
      : { bg: `${colors.info}22`, border: colors.info, text: colors.info };

  // маленькая анимируемая кнопка для Verify
  const MiniButton: React.FC<{
    title: React.ReactNode;
    onPress: () => void;
    variant?: 'filled' | 'outline';
    disabled?: boolean;
  }> = ({ title, onPress, variant = 'filled', disabled }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const [hovered, setHovered] = useState(false);
    const hoveredRef = useRef(false);
    const pressIn = () => {
      if (disabled) return;
      Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, friction: 5 }).start();
    };
    const pressOut = () => {
      if (disabled) return;
      const to = hoveredRef.current ? 1.03 : 1;
      Animated.spring(scale, { toValue: to, useNativeDriver: true, friction: 5 }).start();
    };
    const hoverIn = () => {
      if (disabled) return;
      hoveredRef.current = true;
      setHovered(true);
      Animated.spring(scale, { toValue: 1.03, useNativeDriver: true, friction: 5 }).start();
    };
    const hoverOut = () => {
      if (disabled) return;
      hoveredRef.current = false;
      setHovered(false);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    };
    const baseText = variant === 'filled' ? colors.buttonText : colors.text;
    const textColor = disabled ? colors.disabledText : baseText;
    const disabledBg = colors.disabledBackground;
    const disabledBorder = colors.disabledBackground || colors.border;
    const baseBg = variant === 'filled' ? colors.tint : 'transparent';
    const hoverBg =
      variant === 'filled'
        ? tintColor(colors.tint, 0.12)
        : colors.inputBackground || colors.cardBackground;
    const pressBg =
      variant === 'filled'
        ? shadeColor(colors.tint, 0.12)
        : tintColor(colors.inputBackground || colors.cardBackground, 0.08);
    const renderTitle =
      typeof title === 'string' || typeof title === 'number'
        ? <Text style={{ color: textColor, fontWeight: '700' }}>{title}</Text>
        : title;
    return (
      <Animated.View style={{ transform: [{ scale }], flexGrow: 1 }}>
        <Pressable
          onPressIn={pressIn}
          onPressOut={pressOut}
          onHoverIn={hoverIn}
          onHoverOut={hoverOut}
          onPress={onPress}
          disabled={disabled}
          style={({ pressed }) => [
            {
              height: 44,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 14,
              marginVertical: 4,
              backgroundColor: baseBg,
            },
            disabled
              ? { backgroundColor: disabledBg, borderWidth: 1, borderColor: disabledBorder }
              : variant === 'filled'
              ? null
              : { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
            hovered && !pressed && !disabled ? { backgroundColor: hoverBg } : null,
            pressed && !disabled ? { backgroundColor: pressBg } : null,
          ]}
        >
          {renderTitle}
        </Pressable>
      </Animated.View>
    );
  };

  const BounceButton: React.FC<{
    title: string;
    onPress: () => void;
    loading?: boolean;
    gradientColors: [string, string];
    style?: StyleProp<ViewStyle>;
  }> = ({ title, onPress, loading, gradientColors, style }) => {
    return (
      <ShimmerButton
        title={title}
        onPress={onPress}
        loading={loading}
        haptics
        gradientColors={gradientColors}
        textStyle={ctaTextStyle}
        style={style ? StyleSheet.flatten(style) : undefined}
      />
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
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingHorizontal: contentPadH,
                paddingTop: contentPadTop,
                paddingBottom: contentPadBottom,
                justifyContent: alignTopLayout ? 'flex-start' : 'center',
              },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <Animated.View style={[styles.header, { opacity: fadeIn }]}>
              <View
                style={[
                  styles.logoWrap,
                  {
                    width: logoWrapSize,
                    height: logoWrapSize,
                    borderRadius: Math.round(logoWrapSize * 0.24),
                  },
                ]}
              >
                <Image source={APP_LOGO} style={{ width: logoSize, height: logoSize }} resizeMode="contain" />
              </View>
            </Animated.View>

            {/* Tabs */}
            {!modeVerify && !modeReset && (
              <View style={styles.segmentWrapper}>
                <View style={[styles.segment, { maxWidth: outerW }]}>
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
                  { maxWidth: outerW },
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

            {!!bannerNotice && (
              <View
                style={[
                  styles.noticeWrap,
                  { maxWidth: outerW, backgroundColor: noticePalette.bg, borderColor: noticePalette.border },
                ]}
              >
                <Text style={[styles.noticeText, { color: noticePalette.text }]}>{bannerNotice}</Text>
              </View>
            )}

            {/* Card */}
            <Animated.View
              style={[
                styles.card,
                {
                  width: '100%',
                  maxWidth: outerW,
                  paddingHorizontal: cardPadH,
                  paddingVertical: cardPadV,
                  overflow: 'hidden',
                  opacity: fadeIn,
                  transform: [{ translateY: fadeIn.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
                },
              ]}
            >
              {modeReset ? (
                <View style={{ width: '100%' }}>
                  <Text style={styles.title}>Восстановление пароля</Text>

                  {resetStep === 0 && (
                    <View>
                      <Text style={[styles.secondary, { textAlign: 'center', marginBottom: 12 }]}>
                        Введите email, мы отправим код для сброса пароля
                      </Text>
                      <View style={styles.fieldCompact}>
                        <FormInput
                          size={fieldSize}
                          noMargin
                          label="Email"
                          value={resetEmail}
                          onChangeText={onResetEmailChange}
                          onBlur={() => setResetEmail((prev) => normalizeEmail(prev))}
                          placeholder="you@domain.com"
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="email-address"
                          textContentType="emailAddress"
                          autoComplete="email"
                          returnKeyType="done"
                          onSubmitEditing={handleResetRequest}
                          editable={!loading}
                          error={resetEmailErr || undefined}
                        />
                      </View>

                      <View style={styles.buttonWrap}>
                        <BounceButton
                          title="Отправить код"
                          onPress={handleResetRequest}
                          loading={loading}
                          gradientColors={btnGradient}
                          style={{ height: BTN_HEIGHT }}
                        />
                      </View>

                      <View style={styles.otpActionsRow}>
                        <MiniButton
                          title="Назад"
                          onPress={() => {
                            setModeReset(false);
                            setResetResendTimer(0);
                            setResetCode('');
                            setResetCodeErr('');
                            setBannerNotice('');
                          }}
                          variant="outline"
                        />
                      </View>
                    </View>
                  )}

                  {resetStep === 1 && (
                    <View>
                      <Text style={[styles.secondary, { textAlign: 'center', marginBottom: 12 }]}>
                        Введите 6-значный код, отправленный на {resetEmail}
                      </Text>

                      <OTP6Input
                        value={resetCode}
                        onChange={onResetCodeChange}
                        onFilled={(v) => handleResetVerifyWith(v)}
                        disabled={loading}
                        error={!!resetCodeErr}
                        secure={false}
                        autoFocus
                      />

                      <View style={styles.otpActionsRow}>
                        <MiniButton title="Вставить" onPress={handlePasteResetOTP} variant="filled" />
                        <MiniButton
                          title={
                            resetResendTimer > 0 ? (
                              <Text style={{ color: colors.disabledText, fontWeight: '700' }}>
                                Повторно через{' '}
                                <Text style={{ color: colors.error, fontWeight: '800' }}>{resetResendTimer}</Text> с
                              </Text>
                            ) : (
                              'Отправить повторно'
                            )
                          }
                          onPress={handleResetResendCode}
                          variant="outline"
                          disabled={resetResendTimer > 0}
                        />
                        <MiniButton
                          title="Назад"
                          onPress={() => {
                            setResetStep(0);
                            setBannerNotice('');
                          }}
                          variant="outline"
                        />
                      </View>
                    </View>
                  )}

                  {resetStep === 2 && (
                    <View>
                      <Text style={[styles.secondary, { textAlign: 'center', marginBottom: 12 }]}>
                        Придумайте новый пароль для {resetEmail}
                      </Text>

                      <View style={styles.fieldCompact}>
                        <FormInput
                          size={fieldSize}
                          noMargin
                          label="Новый пароль"
                          value={resetPassword}
                          onChangeText={onResetPassChange}
                          placeholder="Минимум 6 символов"
                          secureTextEntry={!showResetPassword}
                          autoCapitalize="none"
                          autoCorrect={false}
                          textContentType="newPassword"
                          autoComplete="password-new"
                          returnKeyType="next"
                          rightIcon={showResetPassword ? 'eye-off' : 'eye'}
                          onIconPress={() => setShowResetPassword((p) => !p)}
                          editable={!loading}
                          error={resetPassErr || undefined}
                        />
                      </View>

                      <View style={styles.fieldCompact}>
                        <FormInput
                          size={fieldSize}
                          noMargin
                          label="Повторите пароль"
                          value={resetPasswordRepeat}
                          onChangeText={onResetPassRepeatChange}
                          placeholder="Повторите пароль"
                          secureTextEntry={!showResetPassword}
                          autoCapitalize="none"
                          autoCorrect={false}
                          textContentType="password"
                          autoComplete="password"
                          returnKeyType="done"
                          onSubmitEditing={handleResetChange}
                          editable={!loading}
                          error={resetPassRepeatErr || undefined}
                        />
                      </View>

                      <View style={styles.buttonWrap}>
                        <BounceButton
                          title="Сохранить пароль"
                          onPress={handleResetChange}
                          loading={loading}
                          gradientColors={btnGradient}
                          style={{ height: BTN_HEIGHT }}
                        />
                      </View>

                      <View style={styles.otpActionsRow}>
                        <MiniButton title="Назад" onPress={() => setResetStep(1)} variant="outline" />
                      </View>
                    </View>
                  )}
                </View>
              ) : !modeVerify ? (
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
                              size={fieldSize}
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

                          <View style={[styles.fieldCompact, styles.loginPasswordFieldCompact]}>
                            <FormInput
                              size={fieldSize}
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

                          <View style={[styles.loginFooterRow, loginFooterSpacingStyle]}>
                            <Pressable
                              onPress={() => {
                                void handleRememberToggle(!remember);
                              }}
                              style={({ pressed }) => [
                                styles.rememberInline,
                                pressed && styles.rememberInlinePressed,
                              ]}
                            >
                              <Switch
                                value={remember}
                                onValueChange={(v) => {
                                  void handleRememberToggle(v);
                                }}
                              />
                              <Text
                                style={[styles.rememberInlineText, isWebMobile && { fontSize: 13, lineHeight: 18 }]}
                              >
                                Запомнить?
                              </Text>
                            </Pressable>

                            <TouchableOpacity
                              activeOpacity={0.7}
                              style={[styles.forgotInlineLink, isWebMobile && { marginLeft: 'auto' }]}
                              onPress={openResetFlow}
                            >
                              <Text style={[styles.linkText, { color: grad[0] }, isWebMobile && { fontSize: 13 }]}>
                                Забыли пароль?
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                      <View style={styles.buttonWrap}>
                        <BounceButton
                          title="Войти"
                          onPress={handleLogin}
                          loading={loading}
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
                              size={fieldSize}
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
                              size={fieldSize}
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
                              size={fieldSize}
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
                        <BounceButton
                          title="Зарегистрироваться"
                          onPress={handleRegister}
                          loading={loading}
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
                    onChange={onCodeChange}
                    onFilled={(v) => handleVerifyWith(v)}   // авто-отправка при 6 цифрах
                    disabled={loading}
                    error={!!codeErr}
                    secure={false}
                    autoFocus
                  />

                  {/* Кнопки действий */}
                  <View style={styles.otpActionsRow}>
                    <MiniButton title="Вставить" onPress={handlePasteOTP} variant="filled" />
                    <MiniButton
                      title={
                        resendTimer > 0 ? (
                          <Text style={{ color: colors.disabledText, fontWeight: '700' }}>
                            Повторно через{' '}
                            <Text style={{ color: colors.error, fontWeight: '800' }}>{resendTimer}</Text> с
                          </Text>
                        ) : (
                          'Отправить повторно'
                        )
                      }
                      onPress={handleResendCode}
                      variant="outline"
                      disabled={resendTimer > 0}
                    />
                    <MiniButton
                      title="Назад"
                      onPress={() => {
                        setModeVerify(false);
                        setCode('');
                        setCodeErr('');
                        setResendTimer(0);
                        setBannerNotice('');
                      }}
                      variant="outline"
                    />
                  </View>
                </View>
              )}
            </Animated.View>

            <View style={[styles.buildInfo, { maxWidth: outerW, marginTop: isWeb ? 14 : 12 }]}>
              <Text
                style={[
                  styles.buildInfoText,
                  isWeb && { fontSize: isWebMobile ? 12 : 14, lineHeight: isWebMobile ? 18 : 20 },
                ]}
              >
                API: {apiDisplay}
              </Text>
              <Text
                style={[
                  styles.buildInfoText,
                  isWeb && { fontSize: isWebMobile ? 12 : 14, lineHeight: isWebMobile ? 18 : 20 },
                ]}
              >
                Версия приложения: v{versionLabel}
              </Text>
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
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    logoWrap: {
      backgroundColor: 'rgba(255,255,255,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },

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
    noticeWrap: {
      maxWidth: 420,
      width: '100%',
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      marginBottom: 10,
    },
    noticeText: { textAlign: 'center', fontWeight: '700' },

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

    slide: { paddingBottom: Platform.OS === 'web' ? 8 : 4, paddingHorizontal: 0 },

    title: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 14 },

    fieldCompact: { width: '100%', alignSelf: 'stretch', marginBottom: 10 },
    loginPasswordFieldCompact: { marginBottom: 0 },

    loginFooterRow: {
      width: '100%',
      marginTop: 20,
      marginBottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },
    rememberInline: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      borderRadius: 12,
      paddingHorizontal: 0,
      paddingVertical: 2,
    },
    rememberInlinePressed: {
      opacity: 0.9,
    },
    rememberInlineText: {
      color: colors.secondaryText,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      flexShrink: 1,
      marginLeft: 2,
      includeFontPadding: true,
    },
    forgotInlineLink: { flexShrink: 1, alignItems: 'flex-end' },

    buttonWrap: {
      width: '100%',
      alignSelf: 'stretch',
      overflow: 'hidden',
      borderRadius: 16,
      marginTop: 0,
      marginBottom: 0,
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
    buildInfo: {
      marginTop: 12,
      marginBottom: 28,
      width: '100%',
      maxWidth: 420,
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 8,
    },
    buildInfoText: {
      width: '100%',
      fontSize: 12,
      lineHeight: 17,
      color: colors.secondaryText,
      opacity: 0.8,
      textAlign: 'center',
      flexShrink: 1,
    },
  });
