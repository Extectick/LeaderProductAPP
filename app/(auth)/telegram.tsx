import BrandedBackground from '@/components/BrandedBackground';
import ShimmerButton from '@/components/ShimmerButton';
import { AuthContext } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { login } from '@/utils/authService';
import { gradientColors, ThemeKey } from '@/constants/Colors';
import { saveTokens } from '@/utils/tokenService';
import { getProfile } from '@/utils/userService';
import {
  getTelegramInitDataRaw,
  isTelegramMiniApp,
  isTelegramMiniAppLaunch,
  prepareTelegramWebApp,
  requestTelegramContact,
  telegramContactStatus,
  telegramInit,
  telegramLink,
  telegramSignIn,
} from '@/utils/telegramAuthService';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type FlowState = 'checking' | 'need_phone' | 'need_link';
const TG_INITDATA_WAIT_MS = 5000;
const TG_INITDATA_POLL_MS = 120;

async function waitForTelegramInitDataRaw(timeoutMs = TG_INITDATA_WAIT_MS): Promise<string> {
  const stopAt = Date.now() + timeoutMs;
  while (Date.now() < stopAt) {
    prepareTelegramWebApp();
    const raw = getTelegramInitDataRaw();
    if (raw) return raw;
    await new Promise((resolve) => setTimeout(resolve, TG_INITDATA_POLL_MS));
  }
  return '';
}

export default function TelegramAuthScreen() {
  const router = useRouter();
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext is required');
  const { setAuthenticated, setProfile } = auth;

  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const grad = gradientColors[theme as ThemeKey] || gradientColors.light;
  const buttonGradient: [string, string] = [grad[0], grad[1]];
  const styles = useMemo(() => getStyles(colors), [colors]);
  const botUsername = process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME || '';

  const [flowState, setFlowState] = useState<FlowState>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tgSessionToken, setTgSessionToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const initInFlight = useRef(false);

  const finalizeSignIn = useCallback(
    async (token: string) => {
      const data = await telegramSignIn(token);
      await saveTokens(data.accessToken, data.refreshToken, data.profile);
      await setProfile(data.profile ?? null);
      setAuthenticated(true);
      router.replace('/' as any);
    },
    [router, setAuthenticated, setProfile]
  );

  const applyState = useCallback(
    async (
      state: 'AUTHORIZED' | 'NEED_PHONE' | 'NEED_LINK' | 'READY',
      token: string,
      conflictHint?: { maskedEmail: string | null; maskedPhone: string | null } | null
    ) => {
      if (state === 'READY') {
        setBusy(true);
        await finalizeSignIn(token);
        return;
      }
      if (state === 'NEED_LINK') {
        setFlowState('need_link');
        setMaskedEmail(conflictHint?.maskedEmail ?? null);
        setMaskedPhone(conflictHint?.maskedPhone ?? null);
        return;
      }
      setFlowState('need_phone');
    },
    [finalizeSignIn]
  );

  const bootstrap = useCallback(async () => {
    if (initInFlight.current) return;
    initInFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      prepareTelegramWebApp();
      if (!isTelegramMiniAppLaunch()) {
        setFlowState('need_phone');
        setError('Откройте эту страницу из Telegram Mini App.');
        return;
      }
      const initDataRaw = await waitForTelegramInitDataRaw();
      if (!initDataRaw) {
        setFlowState('need_phone');
        setError('Не удалось получить Telegram initData. Проверьте, что Mini App открыта внутри Telegram, и нажмите обновить.');
        return;
      }
      const initData = await telegramInit(initDataRaw);
      setTgSessionToken(initData.tgSessionToken);
      await applyState(initData.state, initData.tgSessionToken, initData.conflictUserHint ?? null);
    } catch (e: any) {
      setFlowState('need_phone');
      setError(e?.message || 'Не удалось инициализировать вход через Telegram');
    } finally {
      setBusy(false);
      initInFlight.current = false;
    }
  }, [applyState]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const checkContactStatus = useCallback(async () => {
    if (!tgSessionToken) return;
    setBusy(true);
    setError(null);
    try {
      const status = await telegramContactStatus(tgSessionToken);
      await applyState(status.state, tgSessionToken, status.conflictUserHint ?? null);
    } catch (e: any) {
      setError(e?.message || 'Не удалось проверить статус контакта');
    } finally {
      setBusy(false);
    }
  }, [applyState, tgSessionToken]);

  const handleRequestContact = useCallback(async () => {
    if (!tgSessionToken) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await requestTelegramContact();
      if (!ok) {
        setNotice('Telegram не передал контакт автоматически. Можно отправить контакт через бота и нажать "Проверить снова".');
      } else {
        setNotice('Запрос контакта отправлен. Проверяем...');
      }
      await checkContactStatus();
    } catch (e: any) {
      setError(e?.message || 'Не удалось запросить контакт');
    } finally {
      setBusy(false);
    }
  }, [checkContactStatus, tgSessionToken]);

  const openBot = useCallback(() => {
    if (!botUsername) return;
    void Linking.openURL(`https://t.me/${botUsername}`);
  }, [botUsername]);

  const handleLink = useCallback(async () => {
    if (!tgSessionToken) return;
    if (!email.trim() || !password.trim()) {
      setError('Введите email и пароль для привязки аккаунта');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      await telegramLink(tgSessionToken);
      const profile = await getProfile();
      if (profile) {
        await setProfile(profile);
      }
      setAuthenticated(true);
      router.replace('/' as any);
    } catch (e: any) {
      setError(e?.message || 'Не удалось привязать Telegram к аккаунту');
    } finally {
      setBusy(false);
    }
  }, [email, password, router, setAuthenticated, setProfile, tgSessionToken]);

  return (
    <BrandedBackground speed={1.2}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>Вход через Telegram</Text>
            <Text style={styles.subtitle}>
              Авторизация Mini App и синхронизация аккаунта
            </Text>

            {busy ? (
              <View style={styles.loaderRow}>
                <ActivityIndicator color={colors.tint} />
                <Text style={styles.loaderText}>Проверяем данные...</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            {flowState === 'need_phone' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Нужен номер телефона</Text>
                <Text style={styles.sectionText}>
                  Без номера нельзя продолжить регистрацию в приложении.
                </Text>
                <ShimmerButton
                  title="Запросить номер в Telegram"
                  onPress={handleRequestContact}
                  loading={busy}
                  gradientColors={buttonGradient}
                />
                <Pressable style={styles.secondaryBtn} onPress={checkContactStatus}>
                  <Text style={styles.secondaryBtnText}>Проверить снова</Text>
                </Pressable>
                {botUsername ? (
                  <Pressable style={styles.secondaryBtn} onPress={openBot}>
                    <Text style={styles.secondaryBtnText}>Открыть бота @{botUsername}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {flowState === 'need_link' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Найдён существующий аккаунт</Text>
                <Text style={styles.sectionText}>
                  Войдите по email/паролю, чтобы привязать Telegram.
                </Text>
                {maskedEmail || maskedPhone ? (
                  <Text style={styles.hintText}>
                    Совпадение: {maskedEmail || '—'} {maskedPhone ? ` / ${maskedPhone}` : ''}
                  </Text>
                ) : null}
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  style={styles.input}
                  placeholder="Пароль"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry
                />
                <ShimmerButton
                  title="Войти и привязать"
                  onPress={handleLink}
                  loading={busy}
                  gradientColors={buttonGradient}
                />
              </View>
            ) : null}

            <Pressable style={styles.backBtn} onPress={() => router.replace('/(auth)/AuthScreen' as any)}>
              <Text style={styles.backBtnText}>Вернуться к обычному входу</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </BrandedBackground>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1 },
    container: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 18,
      paddingVertical: 24,
    },
    card: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      borderRadius: 18,
      padding: 18,
      backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.9)' : colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      gap: 10,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      color: colors.secondaryText,
      textAlign: 'center',
      marginBottom: 4,
    },
    loaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      justifyContent: 'center',
    },
    loaderText: {
      color: colors.secondaryText,
      fontSize: 13,
    },
    error: {
      color: colors.error,
      textAlign: 'center',
      fontWeight: '700',
    },
    notice: {
      color: colors.info,
      textAlign: 'center',
      fontWeight: '700',
    },
    section: {
      marginTop: 8,
      gap: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 12,
      backgroundColor: colors.inputBackground,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
    },
    sectionText: {
      color: colors.secondaryText,
      fontSize: 13,
    },
    hintText: {
      color: colors.secondaryText,
      fontSize: 12,
    },
    input: {
      width: '100%',
      backgroundColor: colors.cardBackground,
      borderColor: colors.inputBorder,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
    },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.cardBackground,
    },
    secondaryBtnText: {
      color: colors.text,
      textAlign: 'center',
      fontWeight: '700',
    },
    backBtn: {
      marginTop: 8,
      paddingVertical: 8,
    },
    backBtnText: {
      color: colors.secondaryText,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
  });
