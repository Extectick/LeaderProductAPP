import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity
} from 'react-native';

const { width } = Dimensions.get('window');

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(width)).current;

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
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const startResendTimer = () => {
    setResendTimer(60);
  };

  const renderError = () => {
    if (!error) return null;
    return <Text style={styles.error}>{error}</Text>;
  };

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await import('../utils/auth').then(({ login }) => login(email, password));
      // TODO: navigate to app main screen after successful login
    } catch (e: any) {
      setError(e.message || 'Ошибка при входе');
    } finally {
      setLoading(false);
    }
  };

  const renderLogin = () => (
    <Animated.View style={[styles.formContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
      <Text style={styles.title}>Вход</Text>
      {renderError()}
      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        editable={!loading}
        placeholderTextColor="#999"
      />
      <TextInput
        style={styles.input}
        placeholder="Пароль"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!loading}
        placeholderTextColor="#999"
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Войти</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { setError(''); setMode('register'); }} disabled={loading}>
        <Text style={styles.switchText}>Нет аккаунта? Зарегистрироваться</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const handleRegister = async () => {
    setLoading(true);
    setError('');
    if (password !== passwordRepeat) {
      setError('Пароли не совпадают');
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов');
      setLoading(false);
      return;
    }
    try {
      await import('../utils/auth').then(({ register }) => register(email, password));
      setMode('verify');
    } catch (e: any) {
      setError(e.message || 'Ошибка при регистрации');
    } finally {
      setLoading(false);
    }
  };

  const renderRegister = () => (
    <Animated.View style={[styles.formContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
      <Text style={styles.title}>Регистрация</Text>
      {renderError()}
      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        editable={!loading}
        placeholderTextColor="#999"
      />
      <TextInput
        style={styles.input}
        placeholder="Пароль (не менее 6 символов)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!loading}
        placeholderTextColor="#999"
      />
      <TextInput
        style={styles.input}
        placeholder="Повторите пароль"
        secureTextEntry
        value={passwordRepeat}
        onChangeText={setPasswordRepeat}
        editable={!loading}
        placeholderTextColor="#999"
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Зарегистрироваться</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { setError(''); setMode('login'); }} disabled={loading}>
        <Text style={styles.switchText}>Уже есть аккаунт? Войти</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const handleVerify = async () => {
    setLoading(true);
    setError('');
    try {
      await import('../utils/auth').then(({ verify }) => verify(email, code));
      // TODO: navigate to app main screen after successful verification
    } catch (e: any) {
      setError(e.message || 'Ошибка при подтверждении');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError('');
    try {
      await import('../utils/auth').then(({ register }) => register(email, password));
      // resend code by re-registering or call a dedicated resend endpoint if available
    } catch (e: any) {
      setError(e.message || 'Ошибка при повторной отправке кода');
    } finally {
      setLoading(false);
    }
  };

  const renderVerify = () => (
    <Animated.View style={[styles.formContainer, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
      <Text style={styles.title}>Подтверждение Email</Text>
      {renderError()}
      <Text style={styles.verifyText}>Введите код из 6 цифр, отправленный на {email}</Text>
      <TextInput
        style={styles.codeInput}
        placeholder="Код подтверждения"
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        editable={!loading}
        placeholderTextColor="#999"
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Подтвердить</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { if (resendTimer === 0) { handleResendCode(); startResendTimer(); } }} disabled={loading || resendTimer > 0}>
        <Text style={[styles.switchText, resendTimer > 0 && styles.disabledText]}>
          {resendTimer > 0 ? `Отправить код повторно через ${resendTimer}с` : 'Отправить код повторно'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      {mode === 'login' && renderLogin()}
      {mode === 'register' && renderRegister()}
      {mode === 'verify' && renderVerify()}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e2f',
    padding: 20,
    justifyContent: 'center',
  },
  formContainer: {
    backgroundColor: '#2a2a3d',
    borderRadius: 16,
    padding: 30,
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 25,
    color: '#f0f0f5',
    textAlign: 'center',
    letterSpacing: 1,
  },
  input: {
    height: 50,
    borderColor: '#444466',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 20,
    paddingHorizontal: 15,
    fontSize: 18,
    color: '#f0f0f5',
    backgroundColor: '#3a3a52',
  },
  codeInput: {
    height: 60,
    borderColor: '#444466',
    borderWidth: 1,
    borderRadius: 12,
    marginVertical: 20,
    paddingHorizontal: 20,
    fontSize: 24,
    letterSpacing: 12,
    color: '#f0f0f5',
    backgroundColor: '#3a3a52',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#5a67d8',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: '#5a67d8',
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  buttonDisabled: {
    backgroundColor: '#8a8ecf',
  },
  buttonText: {
    color: '#f0f0f5',
    fontSize: 20,
    fontWeight: '700',
  },
  switchText: {
    color: '#a0a0c0',
    textAlign: 'center',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
  disabledText: {
    color: '#555577',
  },
  error: {
    color: '#ff6b6b',
    marginBottom: 15,
    textAlign: 'center',
    fontWeight: '600',
  },
  verifyText: {
    color: '#c0c0d0',
    fontSize: 16,
    textAlign: 'center',
  },
});
