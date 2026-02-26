// app/(auth)/AuthScreen.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
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
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import BrandedBackground from '@/components/BrandedBackground';
import FormInput from '@/components/FormInput';
import OTP6Input from '@/components/OTP6Input';
import ThemedLoader from '@/components/ui/ThemedLoader';
import { gradientColors } from '@/constants/Colors';
import { AuthContext } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { API_BASE_URL } from '@/utils/config';
import { isMaxMiniAppLaunch, prepareMaxWebApp } from '@/utils/maxAuthService';
import { isTelegramMiniAppLaunch, prepareTelegramWebApp } from '@/utils/telegramAuthService';
import {
  cancelMessengerQrAuth,
  changePassword,
  getAuthMethods,
  getMessengerQrAuthStatus,
  login,
  register,
  resendVerification,
  requestPasswordReset,
  startMessengerQrAuth,
  verify,
  verifyPasswordReset,
} from '@/utils/authService';
import { getProfileGate } from '@/utils/profileGate';
import { saveTokens } from '@/utils/tokenService';
import { applyWebAutofillFix } from '@/utils/webAutofillFix';
import type { MessengerQrAuthProvider, MessengerQrAuthState } from '@/types/apiTypes';
import { BounceButton, MiniButton } from './authScreen/AuthActionButtons';
import AuthDesktopQrProviders from './authScreen/AuthDesktopQrProviders';
import AuthQrModal from './authScreen/AuthQrModal';
import { APP_LOGO, CARD_PAD_H, ROUTES, STORAGE_KEYS } from './authScreen/constants';
import { getAuthScreenStyles } from './authScreen/styles';
import {
  mapQrFailureReason,
  normalizeEmail,
  normalizeError,
  passwordScore,
  providerLabel,
  validateEmail,
} from './authScreen/utils';

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

/* ───── screen ───── */
export default function AuthScreen() {
  const router = useRouter();
  const { setAuthenticated, setProfile } = useContext(AuthContext) || {};

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    const tryRedirect = () => {
      if (cancelled) return true;
      if (isMaxMiniAppLaunch()) {
        router.replace('/(auth)/max' as Href);
        return true;
      }
      if (!isTelegramMiniAppLaunch()) return false;
      router.replace('/(auth)/telegram' as Href);
      return true;
    };

    if (tryRedirect()) return () => void 0;

    const stopAt = Date.now() + 5000;
    const timer = setInterval(() => {
      prepareMaxWebApp();
      prepareTelegramWebApp();
      if (tryRedirect() || Date.now() >= stopAt) {
        clearInterval(timer);
      }
    }, 120);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [router]);

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
  const styles = useMemo(() => getAuthScreenStyles(colors), [colors]);
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
  const [loginEmail, setLoginEmail] = useState(__authInitCache.email);
  const [loginPassword, setLoginPassword] = useState(__authInitCache.password);
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordRepeat, setRegisterPasswordRepeat] = useState('');
  const [verifyEmail, setVerifyEmail] = useState('');
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
  const [desktopQrProviders, setDesktopQrProviders] = useState<MessengerQrAuthProvider[]>([]);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrProvider, setQrProvider] = useState<MessengerQrAuthProvider | null>(null);
  const [qrSessionToken, setQrSessionToken] = useState('');
  const [qrPayload, setQrPayload] = useState('');
  const [qrDeepLinkUrl, setQrDeepLinkUrl] = useState('');
  const [qrStatus, setQrStatus] = useState<MessengerQrAuthState | null>(null);
  const [qrError, setQrError] = useState('');
  const [qrNotice, setQrNotice] = useState('');
  const [qrBusy, setQrBusy] = useState(false);

  // field-level errors (онлайн-валидация)
  const [loginEmailErr, setLoginEmailErr] = useState('');
  const [loginPassErr, setLoginPassErr] = useState('');
  const [registerEmailErr, setRegisterEmailErr] = useState('');
  const [registerPassErr, setRegisterPassErr] = useState('');
  const [registerPassRepeatErr, setRegisterPassRepeatErr] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [resetEmailErr, setResetEmailErr] = useState('');
  const [resetCodeErr, setResetCodeErr] = useState('');
  const [resetPassErr, setResetPassErr] = useState('');
  const [resetPassRepeatErr, setResetPassRepeatErr] = useState('');

  // ширина стабильна — НЕ меряем её onLayout
  const maxFormWidth = isWeb ? (isWebMobile ? 520 : isWebTablet ? 700 : 470) : 420;
  const outerW = Math.max(0, Math.min(maxFormWidth, winW - contentPadH * 2));
  const logoWrapSize = Math.round(Math.min(Math.max(outerW * 0.34, 104), isWeb ? 156 : 148));
  const logoSize = Math.round(logoWrapSize * 0.78);

  /* refs */
  const loginPassRef = useRef<TextInput>(null);
  const registerPassRef = useRef<TextInput>(null);
  const registerPassRepeatRef = useRef<TextInput>(null);
  const verifyInFlight = useRef(false);
  const lastVerifyCode = useRef('');
  const resetVerifyInFlight = useRef(false);
  const lastResetVerifyCode = useRef('');
  const qrPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrPollingInFlightRef = useRef(false);

  /* anim */
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
    setLoginEmailErr('');
    setLoginPassErr('');
    setRegisterEmailErr('');
    setRegisterPassErr('');
    setRegisterPassRepeatErr('');
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
  }, [bannerError, errorShake]);

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
        setLoginEmail(savedEmail || '');
        setLoginPassword(savedPassword || '');
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
      AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, loginEmail);
      __authInitCache.email = loginEmail;
    }
  }, [loginEmail, remember]);

  useEffect(() => {
    if (remember) {
      AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_PASSWORD, loginPassword);
      __authInitCache.password = loginPassword;
    }
  }, [loginPassword, remember]);

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

  const stopQrPolling = React.useCallback(() => {
    if (qrPollTimerRef.current) {
      clearInterval(qrPollTimerRef.current);
      qrPollTimerRef.current = null;
    }
    qrPollingInFlightRef.current = false;
  }, []);

  const resetQrModalState = React.useCallback(() => {
    setQrProvider(null);
    setQrSessionToken('');
    setQrPayload('');
    setQrDeepLinkUrl('');
    setQrStatus(null);
    setQrError('');
    setQrNotice('');
    setQrBusy(false);
  }, []);

  const pollQrStatus = React.useCallback(
    async (provider: MessengerQrAuthProvider, sessionToken: string) => {
      if (qrPollingInFlightRef.current) return;
      if (!provider || !sessionToken) return;
      qrPollingInFlightRef.current = true;
      try {
        const data = await getMessengerQrAuthStatus(provider, sessionToken);
        setQrStatus(data.state);

        if (data.state === 'AUTHORIZED') {
          stopQrPolling();
          if (!data.accessToken || !data.refreshToken) {
            throw new Error('Сервер не вернул токены для авторизации');
          }
          await saveTokens(data.accessToken, data.refreshToken, data.profile ?? null);
          if (!setAuthenticated || !setProfile) {
            throw new Error('Ошибка состояния авторизации');
          }
          await setProfile(data.profile ?? null);
          setAuthenticated(true);
          const gate = getProfileGate(data.profile ?? null);
          if (gate === 'active') router.replace(ROUTES.HOME);
          else if (gate === 'pending') router.replace(ROUTES.PENDING);
          else if (gate === 'blocked') router.replace(ROUTES.BLOCKED);
          else router.replace(ROUTES.PROFILE);
          setQrModalVisible(false);
          resetQrModalState();
          return;
        }

        if (data.state === 'PENDING') {
          setQrError('');
          setQrNotice(`Сканируйте QR в ${providerLabel(provider)}.`);
          return;
        }

        if (data.state === 'AWAITING_CONTACT') {
          setQrError('');
          setQrNotice(`Откройте ${providerLabel(provider)} и отправьте контакт.`);
          return;
        }

        if (data.state === 'FAILED') {
          stopQrPolling();
          setQrNotice('');
          setQrError(mapQrFailureReason(data.failureReason, provider));
          return;
        }

        if (data.state === 'EXPIRED') {
          stopQrPolling();
          setQrNotice('');
          setQrError('QR-сессия истекла. Запустите вход заново.');
          return;
        }

        if (data.state === 'CANCELLED') {
          stopQrPolling();
          setQrNotice('');
          setQrError('QR-сессия отменена. Запустите вход заново.');
          return;
        }

        if (data.state === 'CONSUMED') {
          stopQrPolling();
          setQrNotice('');
          setQrError('Эта QR-сессия уже использована. Создайте новую.');
        }
      } catch (e: any) {
        setQrNotice('');
        setQrError(normalizeError(e));
      } finally {
        qrPollingInFlightRef.current = false;
      }
    },
    [resetQrModalState, router, setAuthenticated, setProfile, stopQrPolling]
  );

  const startQrPolling = React.useCallback(
    (provider: MessengerQrAuthProvider, sessionToken: string, intervalSec?: number) => {
      stopQrPolling();
      const ms = Math.max(1, Number(intervalSec) || 3) * 1000;
      qrPollTimerRef.current = setInterval(() => {
        void pollQrStatus(provider, sessionToken);
      }, ms);
    },
    [pollQrStatus, stopQrPolling]
  );

  const openQrSignInModal = React.useCallback(
    async (provider: MessengerQrAuthProvider) => {
      setQrModalVisible(true);
      setQrProvider(provider);
      setQrStatus('PENDING');
      setQrBusy(true);
      setQrError('');
      setQrNotice('Генерируем QR-код...');
      stopQrPolling();

      try {
        const started = await startMessengerQrAuth(provider);
        const sessionToken = String(started.sessionToken || '').trim();
        const deepLink = String(started.deepLinkUrl || '').trim();
        const payload = String(started.qrPayload || started.deepLinkUrl || '').trim();

        if (!sessionToken || !deepLink || !payload) {
          throw new Error('Сервер вернул некорректные данные QR-сессии');
        }

        setQrProvider(provider);
        setQrSessionToken(sessionToken);
        setQrDeepLinkUrl(deepLink);
        setQrPayload(payload);
        setQrNotice(`Сканируйте QR в ${providerLabel(provider)} и отправьте контакт.`);
        setQrError('');
        setQrBusy(false);
        void pollQrStatus(provider, sessionToken);
        startQrPolling(provider, sessionToken, started.pollIntervalSec);
      } catch (e: any) {
        setQrBusy(false);
        setQrStatus('FAILED');
        setQrNotice('');
        setQrError(normalizeError(e));
      }
    },
    [pollQrStatus, startQrPolling, stopQrPolling]
  );

  const closeQrModal = React.useCallback(
    async (withCancel = true) => {
      const provider = qrProvider;
      const sessionToken = qrSessionToken;
      const state = qrStatus;
      stopQrPolling();
      setQrModalVisible(false);
      setQrBusy(false);

      if (
        withCancel &&
        provider &&
        sessionToken &&
        (state === 'PENDING' || state === 'AWAITING_CONTACT')
      ) {
        await cancelMessengerQrAuth(provider, sessionToken).catch(() => undefined);
      }

      resetQrModalState();
    },
    [qrProvider, qrSessionToken, qrStatus, resetQrModalState, stopQrPolling]
  );

  const openQrProviderApp = React.useCallback(() => {
    const url = String(qrDeepLinkUrl || '').trim();
    if (!url) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
  }, [qrDeepLinkUrl]);

  useEffect(() => {
    if (!isWeb) {
      setDesktopQrProviders([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const methods = await getAuthMethods();
        if (cancelled) return;
        const providers: MessengerQrAuthProvider[] = [];
        methods.forEach((method) => {
          if (!method.enabled) return;
          if (method.key === 'telegram') providers.push('TELEGRAM');
          if (method.key === 'max') providers.push('MAX');
        });
        setDesktopQrProviders(providers);
      } catch {
        if (!cancelled) {
          setDesktopQrProviders([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isWeb]);

  useEffect(() => {
    if (!qrModalVisible || !qrProvider || !qrSessionToken) return;

    const onForeground = () => {
      void pollQrStatus(qrProvider, qrSessionToken);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onForeground);
    }
    if (typeof document !== 'undefined') {
      const onVisibility = () => {
        if (document.visibilityState === 'visible') onForeground();
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('focus', onForeground);
        }
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onForeground);
      }
    };
  }, [pollQrStatus, qrModalVisible, qrProvider, qrSessionToken]);

  useEffect(() => {
    return () => {
      stopQrPolling();
    };
  }, [stopQrPolling]);

  /* validators (по вводу) */
  const onLoginEmailChange = (v: string) => {
    setLoginEmail(v);
    if (!v.trim()) setLoginEmailErr('Укажите email');
    else if (!validateEmail(v.trim())) setLoginEmailErr('Некорректный email');
    else setLoginEmailErr('');
  };
  const onLoginPassChange = (v: string) => {
    setLoginPassword(v);
    if (!v) setLoginPassErr('Введите пароль');
    else if (v.length < 6) setLoginPassErr('Минимум 6 символов');
    else setLoginPassErr('');
  };
  const onRegisterEmailChange = (v: string) => {
    setRegisterEmail(v);
    if (!v.trim()) setRegisterEmailErr('Укажите email');
    else if (!validateEmail(v.trim())) setRegisterEmailErr('Некорректный email');
    else setRegisterEmailErr('');
  };
  const onRegisterPassChange = (v: string) => {
    setRegisterPassword(v);
    if (!v) setRegisterPassErr('Введите пароль');
    else if (v.length < 6) setRegisterPassErr('Минимум 6 символов');
    else setRegisterPassErr('');
    if (registerPasswordRepeat) setRegisterPassRepeatErr(v === registerPasswordRepeat ? '' : 'Пароли не совпадают');
  };
  const onRegisterPassRepeatChange = (v: string) => {
    setRegisterPasswordRepeat(v);
    if (!v) setRegisterPassRepeatErr('Повторите пароль');
    else if (v !== registerPassword) setRegisterPassRepeatErr('Пароли не совпадают');
    else setRegisterPassRepeatErr('');
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

  const canLogin = !loginEmailErr && !loginPassErr && !!loginEmail.trim() && !!loginPassword;
  const canRegister =
    !registerEmailErr &&
    !registerPassErr &&
    !registerPassRepeatErr &&
    !!registerEmail.trim() &&
    !!registerPassword &&
    !!registerPasswordRepeat;

  /* actions */
  const handleLogin = async () => {
    if (!canLogin) {
      if (!loginEmail.trim()) setLoginEmailErr('Укажите email');
      if (!loginPassword) setLoginPassErr('Введите пароль');
      setBannerError('Проверьте обязательные поля');
      return;
    }
    const em = normalizeEmail(loginEmail);

    if (!setAuthenticated || !setProfile) return setBannerError('Ошибка аутентификации');

    setLoading(true);
    setBannerError('');
    try {
      await login(em, loginPassword);
      setAuthenticated(true);

      if (remember) {
        __authInitCache.remember = true;
        __authInitCache.email = em;
        __authInitCache.password = loginPassword;
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.REMEMBER_FLAG, '1'],
          [STORAGE_KEYS.REMEMBER_EMAIL, em],
          [STORAGE_KEYS.REMEMBER_PASSWORD, loginPassword],
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
      setBannerError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!canRegister) {
      if (!registerEmail.trim()) setRegisterEmailErr('Укажите email');
      if (!registerPassword) setRegisterPassErr('Введите пароль');
      if (!registerPasswordRepeat) setRegisterPassRepeatErr('Повторите пароль');
      setBannerError('Проверьте обязательные поля');
      return;
    }
    const em = normalizeEmail(registerEmail);

    setLoading(true);
    setBannerError('');
    try {
      await register(em, registerPassword, em.split('@')[0]);
      setVerifyEmail(em);
      setCode('');
      setCodeErr('');
      setModeReset(false);
      setModeVerify(true);
      setResendTimer(30);
      Haptics.selectionAsync();
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
      const em = normalizeEmail(verifyEmail || registerEmail);
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
      setVerifyEmail(em);
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
      const em = normalizeEmail(verifyEmail || registerEmail);
      if (!validateEmail(em)) {
        setBannerError('Некорректный email');
        return;
      }
      setVerifyEmail(em);
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

  const readClipboardTextSafe = async () => {
    try {
      const fromExpo = await Clipboard.getStringAsync();
      if (fromExpo) return String(fromExpo);
    } catch {
      // noop: fallback to Web Clipboard API below
    }

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator?.clipboard?.readText) {
      try {
        return await navigator.clipboard.readText();
      } catch {
        // noop: handled by caller
      }
    }

    return '';
  };

  const requestOtpViaPromptIfNeeded = (source: string) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
    return window.prompt(`Вставьте ${source} (6 цифр):`, '') || '';
  };

  const handlePasteOTP = async () => {
    try {
      let str = await readClipboardTextSafe();
      if (!str) {
        str = requestOtpViaPromptIfNeeded('код подтверждения');
      }
      const only = (str || '').replace(/\D/g, '').slice(0, 6);
      if (!only) {
        setBannerNoticeTone('info');
        setBannerNotice('Не удалось вставить код. Разрешите доступ к буферу или введите код вручную.');
        return;
      }
      setCode(only); // OTP6Input получит value и сам вызовет onFilled
      setCodeErr(only.length === 6 ? '' : 'Код из 6 цифр');
      setBannerError('');
      setBannerNotice('');
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
      await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_EMAIL, normalizeEmail(loginEmail));
      await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_PASSWORD, loginPassword);
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
    const em = loginEmail.trim() ? normalizeEmail(loginEmail) : '';
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
      setLoginPassword('');
      setRegisterPassword('');
      setRegisterPasswordRepeat('');
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
      let str = await readClipboardTextSafe();
      if (!str) {
        str = requestOtpViaPromptIfNeeded('код для сброса');
      }
      const only = (str || '').replace(/\D/g, '').slice(0, 6);
      if (!only) {
        setBannerNoticeTone('info');
        setBannerNotice('Не удалось вставить код. Разрешите доступ к буферу или введите код вручную.');
        return;
      }
      setResetCode(only);
      setResetCodeErr(only.length === 6 ? '' : 'Код из 6 цифр');
      setBannerError('');
      setBannerNotice('');
      Haptics.selectionAsync();
    } catch {
      setBannerError('Не удалось получить текст из буфера');
    }
  };

  const handleWebEnter = (event: any, action: () => void) => {
    if (Platform.OS !== 'web') return;
    if (event?.nativeEvent?.key !== 'Enter') return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (loading || modeVerify || modeReset) return;
    action();
  };

  /* derived */
  const ps = passwordScore(registerPassword);
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
                          textStyle={ctaTextStyle}
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
                          colors={colors}
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
                        <MiniButton title="Вставить" onPress={handlePasteResetOTP} colors={colors} variant="filled" />
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
                          colors={colors}
                          variant="outline"
                          disabled={resetResendTimer > 0}
                        />
                        <MiniButton
                          title="Назад"
                          onPress={() => {
                            setResetStep(0);
                            setBannerNotice('');
                          }}
                          colors={colors}
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
                          textStyle={ctaTextStyle}
                          style={{ height: BTN_HEIGHT }}
                        />
                      </View>

                      <View style={styles.otpActionsRow}>
                        <MiniButton title="Назад" onPress={() => setResetStep(1)} colors={colors} variant="outline" />
                      </View>
                    </View>
                  )}
                </View>
              ) : !modeVerify ? (
                tab === 0 ? (
                  <View style={styles.slide}>
                    <Text style={styles.title}>Вход</Text>
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
                            value={loginEmail}
                            onChangeText={onLoginEmailChange}
                            onBlur={() => setLoginEmail((prev) => normalizeEmail(prev))}
                            placeholder="your@email.com"
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                            textContentType="emailAddress"
                            autoComplete="email"
                            returnKeyType="next"
                            onKeyPress={(e) => handleWebEnter(e, () => loginPassRef.current?.focus())}
                            onSubmitEditing={() => loginPassRef.current?.focus()}
                            editable={!loading}
                            error={loginEmailErr || undefined}
                          />
                        </View>

                        <View style={[styles.fieldCompact, styles.loginPasswordFieldCompact]}>
                          <FormInput
                            size={fieldSize}
                            noMargin
                            label="Пароль"
                            ref={loginPassRef}
                            value={loginPassword}
                            onChangeText={onLoginPassChange}
                            placeholder="••••••••"
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            textContentType="password"
                            autoComplete="password"
                            returnKeyType="done"
                            onKeyPress={(e) => handleWebEnter(e, handleLogin)}
                            onSubmitEditing={handleLogin}
                            rightIcon={showPassword ? 'eye-off' : 'eye'}
                            onIconPress={() => setShowPassword((p) => !p)}
                            editable={!loading}
                            error={loginPassErr || undefined}
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
                        textStyle={ctaTextStyle}
                        style={{ height: BTN_HEIGHT }}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.slide}>
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
                            value={registerEmail}
                            onChangeText={onRegisterEmailChange}
                            onBlur={() => setRegisterEmail((prev) => normalizeEmail(prev))}
                            placeholder="you@domain.com"
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                            textContentType="emailAddress"
                            autoComplete="email"
                            returnKeyType="next"
                            onKeyPress={(e) => handleWebEnter(e, () => registerPassRef.current?.focus())}
                            onSubmitEditing={() => registerPassRef.current?.focus()}
                            editable={!loading}
                            error={registerEmailErr || undefined}
                          />
                        </View>

                        <View style={styles.fieldCompact}>
                          <FormInput
                            size={fieldSize}
                            noMargin
                            label="Пароль"
                            ref={registerPassRef}
                            value={registerPassword}
                            onChangeText={onRegisterPassChange}
                            placeholder="Минимум 6 символов"
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            textContentType="newPassword"
                            autoComplete="password-new"
                            returnKeyType="next"
                            onKeyPress={(e) => handleWebEnter(e, () => registerPassRepeatRef.current?.focus())}
                            onSubmitEditing={() => registerPassRepeatRef.current?.focus()}
                            rightIcon={showPassword ? 'eye-off' : 'eye'}
                            onIconPress={() => setShowPassword((p) => !p)}
                            editable={!loading}
                            error={registerPassErr || undefined}
                          />
                        </View>

                        {!!registerPassword && (
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
                            ref={registerPassRepeatRef}
                            value={registerPasswordRepeat}
                            onChangeText={onRegisterPassRepeatChange}
                            placeholder="Повторите пароль"
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            textContentType="password"
                            autoComplete="password"
                            returnKeyType="done"
                            onKeyPress={(e) => handleWebEnter(e, handleRegister)}
                            onSubmitEditing={handleRegister}
                            editable={!loading}
                            error={registerPassRepeatErr || undefined}
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
                        textStyle={ctaTextStyle}
                        style={{ height: BTN_HEIGHT }}
                      />
                    </View>
                  </View>
                )
              ) : (
                /* VERIFY */
                <View style={{ width: '100%' }}>
                  <Text style={styles.title}>Подтверждение 📩</Text>
                  <Text style={[styles.secondary, { textAlign: 'center', marginBottom: 12 }]}>
                    Введите 6-значный код, отправленный на {verifyEmail}
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
                    <MiniButton title="Вставить" onPress={handlePasteOTP} colors={colors} variant="filled" />
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
                      colors={colors}
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
                      colors={colors}
                      variant="outline"
                    />
                  </View>
                </View>
              )}
            </Animated.View>

            {isWeb && (
              <AuthDesktopQrProviders
                providers={desktopQrProviders}
                outerW={outerW}
                styles={styles}
                onOpen={openQrSignInModal}
              />
            )}

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
        {!isWeb && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Войти через Telegram"
            activeOpacity={0.9}
            onPress={() => router.replace('/(auth)/telegram' as Href)}
            style={[styles.telegramFloatingBtn, { bottom: (Platform.OS === 'web' ? 14 : 10) + insets.bottom }]}
          >
            <Ionicons name="paper-plane" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </SafeAreaView>

      <AuthQrModal
        visible={qrModalVisible}
        provider={qrProvider}
        qrBusy={qrBusy}
        qrPayload={qrPayload}
        qrNotice={qrNotice}
        qrError={qrError}
        qrDeepLinkUrl={qrDeepLinkUrl}
        styles={styles}
        onOpenProviderApp={openQrProviderApp}
        onRetry={() => {
          if (!qrProvider) return;
          void openQrSignInModal(qrProvider);
        }}
        onClose={() => {
          void closeQrModal(true);
        }}
      />
    </BrandedBackground>
  );
}

