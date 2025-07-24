import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import FormInput from '../components/FormInput';
import { useThemeColor } from '../hooks/useThemeColor';
import * as authUtils from '../utils/auth';
import getStyles from './AuthScreen.styles';

const { width } = Dimensions.get('window');

function validateEmail(email: string) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.toLowerCase());
}

export default function AuthScreen() {
  const router = useRouter();

  // Получаем все нужные цвета через хук useThemeColor
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const inputBorder = useThemeColor({}, 'inputBorder');
  const button = useThemeColor({}, 'button');
  const buttonText = useThemeColor({}, 'buttonText');
  const secondaryText = useThemeColor({}, 'secondaryText');
  const error = useThemeColor({}, 'error');
  const placeholder = useThemeColor({}, 'placeholder');
  const buttonDisabled = useThemeColor({}, 'buttonDisabled');
  const cardBackground = useThemeColor({}, 'cardBackground');

  // Получаем стили с текущими цветами
  const styles = getStyles({
    background,
    text,
    inputBackground,
    inputBorder,
    button,
    buttonText,
    secondaryText,
    error,
    placeholder,
    buttonDisabled,
    cardBackground,
  });

  const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordRepeat, setShowPasswordRepeat] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(width)).current;

  // Input refs для управления фокусом
  const passwordRef = useRef<TextInput>(null);
  const passwordRepeatRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);

  const insets = useSafeAreaInsets();

  const keyboardVerticalOffset = Platform.select({
    ios: insets.top, // например, 44 на iPhone X
    android: StatusBar.currentHeight || 0,
    default: 0,
  });

  // Проверяем авторизацию при загрузке
  useEffect(() => {
    let isMounted = true;
    
    const checkAuth = async () => {
      try {
        const token = await authUtils.ensureAuth();
        if (token && isMounted) {
          router.replace('/');
        }
      } catch (e) {
        console.log('Auth check error:', e);
      } finally {
        if (isMounted) {
          setCheckingAuth(false);
        }
      }
    };

    checkAuth();
    
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(width);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]).start();
  }, [mode]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (resendTimer > 0) {
      timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [resendTimer]);

  useEffect(() => {
    setError('');
    if (mode === 'register') {
      if (email && !validateEmail(email)) {
        setError('Некорректный email');
      } else if (password && password.length < 6) {
        setError('Пароль должен быть не менее 6 символов');
      } else if (password && passwordRepeat && password !== passwordRepeat) {
        setError('Пароли не совпадают');
      }
    }
    if (mode === 'login') {
      if (email && !validateEmail(email)) {
        setError('Некорректный email');
      }
    }
  }, [email, password, passwordRepeat, mode]);

  const handleLogin = async () => {
    if (!validateEmail(email)) return setError('Введите корректный email');
    if (!password) return setError('Введите пароль');

    setLoading(true);
    setError('');
    try {
      const result = await authUtils.login(email, password);
      console.log('Login result:', result);
      setError('Вход выполнен успешно!');
      // Временно убрали редирект для диагностики
      router.replace('/');
    } catch (e: any) {
      console.error('Login error:', e);
      setError(e.message || 'Ошибка при входе');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!validateEmail(email)) return setError('Введите корректный email');
    if (password.length < 6) return setError('Пароль должен быть не менее 6 символов');
    if (password !== passwordRepeat) return setError('Пароли не совпадают');

    setLoading(true);
    setError('');
    try {
      await authUtils.register(email, password);
      setMode('verify');
      setResendTimer(30);
    } catch (e: any) {
      setError(e.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      return setError('Введите корректный код подтверждения');
    }

    setLoading(true);
    setError('');
    try {
      const result = await authUtils.verify(email, code);
      console.log('Verify result:', result);
      setError('Аккаунт подтвержден успешно!');
      // Временно убрали редирект для диагностики
      router.replace('/');
    } catch (e: any) {
      console.error('Verify error:', e);
      setError(e.message || 'Ошибка подтверждения');
    } finally {
      setLoading(false);
    }
  };

  // Убрали проверку авторизации при загрузке

  const renderError = () => (errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null);

  const renderLogin = () => (
    <Animated.View
      style={[
        styles.formContainer,
        { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
      ]}
      pointerEvents={loading ? 'none' : 'auto'}
    >
      <Text style={styles.title}>Вход</Text>
      {renderError()}
      <FormInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        blurOnSubmit={false}
        editable={!loading}
      />
      <FormInput
        label="Пароль"
        ref={passwordRef}
        value={password}
        onChangeText={setPassword}
        placeholder="Пароль"
        secureTextEntry={!showPassword}
        autoComplete="password"
        returnKeyType="done"
        onSubmitEditing={handleLogin}
        rightIcon={showPassword ? 'eye-off' : 'eye'}
        onIconPress={() => setShowPassword((prev) => !prev)}
        editable={!loading}
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={styles.buttonText.color} />
        ) : (
          <Text style={styles.buttonText}>Войти</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          setError('');
          setMode('register');
        }}
        disabled={loading}
      >
        <Text style={styles.switchText}>Нет аккаунта? Регистрация</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderRegister = () => (
    <Animated.View
      style={[
        styles.formContainer,
        { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
      ]}
      pointerEvents={loading ? 'none' : 'auto'}
    >
      <Text style={styles.title}>Регистрация</Text>
      {renderError()}
      <FormInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        blurOnSubmit={false}
        editable={!loading}
      />
      <FormInput
        label="Пароль"
        ref={passwordRef}
        value={password}
        onChangeText={setPassword}
        placeholder="Пароль"
        secureTextEntry={!showPassword}
        autoComplete="password"
        returnKeyType="next"
        onSubmitEditing={() => passwordRepeatRef.current?.focus()}
        rightIcon={showPassword ? 'eye-off' : 'eye'}
        onIconPress={() => setShowPassword((prev) => !prev)}
        blurOnSubmit={false}
        editable={!loading}
      />
      <FormInput
        label="Повторите пароль"
        ref={passwordRepeatRef}
        value={passwordRepeat}
        onChangeText={setPasswordRepeat}
        placeholder="Повторите пароль"
        secureTextEntry={!showPassword}
        autoComplete="password"
        returnKeyType="done"
        onSubmitEditing={handleRegister}
        // rightIcon={showPasswordRepeat ? 'eye-off' : 'eye'}
        // onIconPress={() => setShowPasswordRepeat((prev) => !prev)}
        editable={!loading}
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={styles.buttonText.color} />
        ) : (
          <Text style={styles.buttonText}>Зарегистрироваться</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          setError('');
          setMode('login');
        }}
        disabled={loading}
      >
        <Text style={styles.switchText}>Уже есть аккаунт? Войти</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderVerify = () => (
    <Animated.View
      style={[
        styles.formContainer,
        { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
      ]}
      pointerEvents={loading ? 'none' : 'auto'}
    >
      <Text style={styles.title}>Подтверждение</Text>
      {renderError()}
      <Text style={styles.verifyText}>Код отправлен на {email}</Text>
      <FormInput
        label="Код подтверждения"
        ref={codeRef}
        value={code}
        onChangeText={setCode}
        placeholder="Код"
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="off"
        textAlign="center"
        returnKeyType="done"
        onSubmitEditing={handleVerify}
        editable={!loading}
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={styles.buttonText.color} />
        ) : (
          <Text style={styles.buttonText}>Подтвердить</Text>
        )}
      </TouchableOpacity>
      {resendTimer > 0 ? (
        <Text style={styles.secondaryText}>Повторная отправка через {resendTimer} сек</Text>
      ) : (
        <TouchableOpacity
          onPress={() => {
            setError('');
            setResendTimer(30);
            // TODO: реализовать повторную отправку кода
          }}
          disabled={loading}
        >
          <Text style={styles.switchText}>Отправить код повторно</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: styles.container.backgroundColor }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 20,
            paddingVertical: 40,
            alignItems: 'center',
            backgroundColor: styles.container.backgroundColor,
          }}
          keyboardShouldPersistTaps="handled"
        >
          
          {mode === 'login' && renderLogin()}
          {mode === 'register' && renderRegister()}
          {mode === 'verify' && renderVerify()}
        <ThemeSwitcher />
        </ScrollView>
      </KeyboardAvoidingView>
      
    </SafeAreaView>
  );
}
