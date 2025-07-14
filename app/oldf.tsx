import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('theme').then(value => {
      if (value === 'dark') {
        setIsDark(true);
      } else {
        setIsDark(false);
      }
    });
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    AsyncStorage.setItem('theme', newTheme ? 'dark' : 'light');
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[\w.-]+@[\w.-]+\.[A-Za-z]{2,}$/;
    return emailRegex.test(email);
  };

  const handleAction = () => {
    if (!email || !password) {
      setError('Пожалуйста, заполните все поля');
      return;
    }
    if (!validateEmail(email)) {
      setError('Некорректный формат email');
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов');
      return;
    }
    setError('');
    if (isLogin) {
      // Логика входа
    } else {
      // Логика регистрации
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark ? styles.darkBackground : styles.lightBackground]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 80}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.inner}>
          <View style={styles.header}>
            <View style={styles.switchContainer}>
              <TouchableOpacity
                style={[styles.switchButton, isLogin && styles.activeSwitch]}
                onPress={() => setIsLogin(true)}
              >
                <Text style={[styles.switchText, isLogin && styles.activeSwitchText]}>Вход</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.switchButton, !isLogin && styles.activeSwitch]}
                onPress={() => setIsLogin(false)}
              >
                <Text style={[styles.switchText, !isLogin && styles.activeSwitchText]}>Регистрация</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.themeToggle}>
              <Text style={[styles.themeText, isDark && styles.activeSwitchText]}>
                {isDark ? '🌙' : '☀️'}
              </Text>
              <Switch value={isDark} onValueChange={toggleTheme} />
            </View>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            style={{ backgroundColor: 'transparent' }}
          >
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Пароль"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TouchableOpacity style={styles.button} onPress={handleAction}>
              <Text style={styles.buttonText}>{isLogin ? 'Войти' : 'Зарегистрироваться'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 30,
    paddingTop: 60,
    backgroundColor: '#f5f7fa',
    width: '100%',
    height: '100%',
  },
  darkBackground: {
    backgroundColor: '#121212',
  },
  lightBackground: {
    backgroundColor: '#f5f7fa',
  },
  inner: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  switchContainer: {
    flexDirection: 'row',
    borderRadius: 30,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
  },
  switchButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
  },
  activeSwitch: {
    backgroundColor: '#4a90e2',
  },
  switchText: {
    fontSize: 18,
    color: '#555',
  },
  activeSwitchText: {
    color: '#fff',
    fontWeight: '700',
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeText: {
    fontSize: 24,
    marginRight: 12,
    color: '#555',
  },
  content: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  error: {
    color: '#d32f2f',
    marginBottom: 15,
    textAlign: 'center',
    fontWeight: '600',
  },
  input: {
    height: 55,
    borderColor: '#bbb',
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 15,
    borderRadius: 10,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#4a90e2',
    paddingVertical: 18,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
});
