import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import * as authUtils from '../utils/auth';
import styles from './AuthScreen.styles';

const { width } = Dimensions.get('window');

export default function AuthScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(width)).current;

  const [formWidth, setFormWidth] = useState<number>(Platform.OS === 'web' ? Math.min(width * 0.8, 600) : width);

  useEffect(() => {
    const checkAuthorization = async () => {
      try {
        const token = await authUtils.ensureAuth();
        if (token) {
          const profile = await authUtils.getProfile();
          const hasProfile = !!(profile?.clientProfile || profile?.supplierProfile || profile?.employeeProfile);
          router.replace(hasProfile ? '/' : '/ProfileSelectionScreen');
        }
      } catch {
        // not authorized
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuthorization();
  }, []);

  useEffect(() => {
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
    if (Platform.OS === 'web') {
      const handleResize = () => {
        setFormWidth(Math.min(window.innerWidth * 0.8, 600));
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await authUtils.login(email, password);
      const profile = await authUtils.getProfile();
      const hasProfile = !!(profile?.clientProfile || profile?.supplierProfile || profile?.employeeProfile);
      router.replace(hasProfile ? '/' : '/ProfileSelectionScreen');
    } catch (e: any) {
      setError(e.message || 'Ошибка при входе');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError('');
    if (password !== passwordRepeat) return setError('Пароли не совпадают');
    if (password.length < 6) return setError('Пароль слишком короткий');

    setLoading(true);
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
    setLoading(true);
    setError('');
    try {
      await authUtils.verify(email, code);
      const profile = await authUtils.getProfile();
      const hasProfile = !!(profile?.clientProfile || profile?.supplierProfile || profile?.employeeProfile);
      router.replace(hasProfile ? '/' : '/ProfileSelectionScreen');
    } catch (e: any) {
      setError(e.message || 'Ошибка подтверждения');
    } finally {
      setLoading(false);
    }
  };

  const renderError = () => error && <Text style={styles.error}>{error}</Text>;

  if (checkingAuth) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#5a67d8" />
      </View>
    );
  }

  const renderLogin = () => (
    <Animated.View style={[styles.formContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }], width: formWidth }]}>
      <Text style={styles.title}>Вход</Text>
      {renderError()}
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Пароль" secureTextEntry value={password} onChangeText={setPassword} />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Войти</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { setError(''); setMode('register'); }}>
        <Text style={styles.switchText}>Нет аккаунта? Регистрация</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderRegister = () => (
    <Animated.View style={[styles.formContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }], width: formWidth }]}>
      <Text style={styles.title}>Регистрация</Text>
      {renderError()}
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Пароль" secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput style={styles.input} placeholder="Повторите пароль" secureTextEntry value={passwordRepeat} onChangeText={setPasswordRepeat} />
      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Зарегистрироваться</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { setError(''); setMode('login'); }}>
        <Text style={styles.switchText}>Уже есть аккаунт? Войти</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderVerify = () => (
    <Animated.View style={[styles.formContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }], width: formWidth }]}>
      <Text style={styles.title}>Подтверждение</Text>
      {renderError()}
      <Text style={styles.verifyText}>Код отправлен на {email}</Text>
      <TextInput style={styles.codeInput} placeholder="Код" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} />
      <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Подтвердить</Text>}
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {mode === 'login' && renderLogin()}
      {mode === 'register' && renderRegister()}
      {mode === 'verify' && renderVerify()}
    </KeyboardAvoidingView>
  );
}

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: '#1e1e2f', justifyContent: 'center', alignItems: 'center' },
//   loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e1e2f' },
//   formContainer: { backgroundColor: '#2a2a3d', borderRadius: 16, padding: 30 },
//   title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, color: '#fff', textAlign: 'center' },
//   input: { backgroundColor: '#3a3a52', borderRadius: 8, paddingHorizontal: 15, height: 50, marginBottom: 15, color: '#fff' },
//   codeInput: { textAlign: 'center', fontSize: 22, letterSpacing: 10, backgroundColor: '#3a3a52', color: '#fff', borderRadius: 8, height: 60, marginVertical: 20 },
//   button: { backgroundColor: '#5a67d8', paddingVertical: 15, borderRadius: 10, alignItems: 'center', marginBottom: 15 },
//   buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
//   switchText: { color: '#a0a0c0', textAlign: 'center', fontSize: 16 },
//   error: { color: '#ff6b6b', textAlign: 'center', marginBottom: 15 },
//   verifyText: { color: '#ccc', textAlign: 'center', marginBottom: 10 },
// });
