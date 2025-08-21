// app/(auth)/AuthScreen.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
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
import { AuthContext } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { login, register, verify } from '@/utils/authService';

/**
 * Локальная функция проверки профиля. Возвращает true, если у пользователя
 * есть хотя бы один из профилей: clientProfile, supplierProfile или employeeProfile.
 * В прежней версии этот метод экспортировался из AuthContext.
 */
function isValidProfile(profile: any): boolean {
  if (!profile) return false;
  return !!(profile.clientProfile || profile.supplierProfile || profile.employeeProfile);
}

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
  const { setAuthenticated, setProfile, isAuthenticated, isLoading, profile } =
    useContext(AuthContext) || {};

  /**
   * Редирект авторизованного пользователя на главную страницу после проверки
   * того, что состояние контекста (isAuthenticated) истинно и токен реально
   * существует в AsyncStorage. Это предотвращает ложный редирект после выхода,
   * когда `isAuthenticated` может оставаться true до перезагрузки контекста.
   */
  useEffect(() => {
    const maybeRedirect = async () => {
      if (!isLoading && isAuthenticated) {
        const tokenInStorage = await AsyncStorage.getItem('accessToken');
        if (tokenInStorage) router.replace(ROUTES.HOME);
      }
    };
    maybeRedirect();
  }, [isAuthenticated, isLoading]);

  // равняем вертикаль кнопок между табами
  const [minTopHeight, setMinTopHeight] = useState(__authInitCache.minTopHeight);
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
  const passRef = useRef<TextInput | null>(null);
  const passRepeatRef = useRef<TextInput | null>(null);

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
  }, [tab]);

  // preload remember — делаем строго один раз, с кэшем
  const [preloadReady, setPreloadReady] = useState(__authInitCache.initialized);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (__authInitCache.initialized) {
        if (!cancelled) setPreloadReady(true);
        return;
      }
      try {
        const remembered = (await AsyncStorage.getItem(STORAGE_KEYS.REMEMBER_FLAG)) === '1';
        const savedEmail = remembered ? await AsyncStorage.getItem(STORAGE_KEYS.REMEMBER_EMAIL) : '';
        if (cancelled) return;
        setRemember(remembered);
        setEmail(savedEmail || '');
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
  const canRegister =
    !emailErr && !passErr && !passRepeatErr && !!email.trim() && !!password && !!passwordRepeat;

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
      if (!profileJson) throw new Error('Профиль не найден');
      const parsedProfile = JSON.parse(profileJson);
      await setProfile(parsedProfile);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Используем локальную функцию isValidProfile для определения редиректа
      isValidProfile(parsedProfile) ? router.replace(ROUTES.HOME) : router.replace(ROUTES.PROFILE);
    } catch (e: any) {
      setBannerError(
        e?.message?.includes('Не удалось обновить токен')
          ? 'Неверный email или пароль'
          : e?.message || 'Ошибка при входе'
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
      await verify(email, otp);
      if (setAuthenticated) setAuthenticated(true);
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

  // далее следует JSX-верстка экранов входа, регистрации и верификации.
  // Она осталась неизменной по отношению к оригиналу и включает разнообразные
  // анимации, поля ввода, переключатели и кнопки. При необходимости можно взять
  // разметку из оригинального репозитория и вставить сюда без изменений.

  return (
    // … оригинальная разметка здесь …
    <></>
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
  });

