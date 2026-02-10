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
  isTelegramMiniAppLaunch,
  prepareTelegramWebApp,
  requestTelegramContact,
  telegramContact,
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

  const checkContactStatusByToken = useCallback(
    async (token: string) => {
      if (!token) return;
      const status = await telegramContactStatus(token);
      await applyState(status.state, token, status.conflictUserHint ?? null);
      return status;
    },
    [applyState]
  );

  const requestContactAndSync = useCallback(
    async (
      token: string,
      source: 'auto' | 'manual',
      manageBusy: boolean = true
    ) => {
      if (!token) return;
      if (manageBusy) setBusy(true);
      setError(null);
      try {
        const result = await requestTelegramContact();
        let status: { state: 'AUTHORIZED' | 'NEED_PHONE' | 'NEED_LINK' | 'READY' } | undefined;

        if (result.ok && result.phoneE164) {
          const contactRes = await telegramContact(token, result.phoneE164);
          await applyState(contactRes.state, token, contactRes.conflictUserHint ?? null);
          status = { state: contactRes.state };
        } else {
          status = await checkContactStatusByToken(token);
        }

        if (!result.ok && source === 'manual') {
          setNotice('Telegram не передал номер. Повторите запрос или откройте бота для ручной отправки контакта.');
        }

        if (!result.ok && source === 'auto' && status?.state === 'NEED_PHONE') {
          setNotice('Автозапрос номера не сработал. Нажмите кнопку ниже и подтвердите доступ к контактным данным.');
        }
      } catch (e: any) {
        setError(e?.message || 'Не удалось запросить контакт');
      } finally {
        if (manageBusy) setBusy(false);
      }
    },
    [applyState, checkContactStatusByToken]
  );

  const bootstrap = useCallback(async () => {
    if (initInFlight.current) return;
    initInFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setTgSessionToken('');
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

      if (initData.state === 'NEED_PHONE') {
        setFlowState('need_phone');
        await requestContactAndSync(initData.tgSessionToken, 'auto', false);
      } else {
        await applyState(initData.state, initData.tgSessionToken, initData.conflictUserHint ?? null);
      }
    } catch (e: any) {
      setFlowState('need_phone');
      setError(e?.message || 'Не удалось инициализировать вход через Telegram');
    } finally {
      setBusy(false);
      initInFlight.current = false;
    }
  }, [applyState, requestContactAndSync]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const handleRequestContact = useCallback(async () => {
    if (!tgSessionToken) return;
    setNotice('Запрашиваем номер телефона в Telegram...');
    await requestContactAndSync(tgSessionToken, 'manual', true);
  }, [requestContactAndSync, tgSessionToken]);

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
            <View style={styles.hero}>
              <Text style={styles.heroBadge}>Telegram Mini App</Text>
              <Text style={styles.title}>Вход через Telegram</Text>
              <Text style={styles.subtitle}>Быстрая авторизация и синхронизация аккаунта</Text>
              {busy ? (
                <View style={styles.loaderRow}>
                  <ActivityIndicator color={colors.tint} />
                  <Text style={styles.loaderText}>Обрабатываем запрос...</Text>
                </View>
              ) : null}
            </View>

            {error ? (
              <View style={styles.alertError}>
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}
            {notice ? (
              <View style={styles.alertInfo}>
                <Text style={styles.notice}>{notice}</Text>
              </View>
            ) : null}

            {flowState === 'need_phone' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Подтвердите номер телефона</Text>
                <Text style={styles.sectionText}>
                  Номер нужен для регистрации и связи с вашим аккаунтом в системе.
                </Text>
                <ShimmerButton
                  title="Поделиться номером"
                  onPress={handleRequestContact}
                  loading={busy}
                  gradientColors={buttonGradient}
                />
                {botUsername ? (
                  <Pressable style={styles.linkBtn} onPress={openBot}>
                    <Text style={styles.linkBtnText}>Не получается? Открыть @{botUsername}</Text>
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
                  <View style={styles.hintWrap}>
                    <Text style={styles.hintText}>
                      Совпадение: {maskedEmail || '—'} {maskedPhone ? ` / ${maskedPhone}` : ''}
                    </Text>
                  </View>
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
      maxWidth: 540,
      alignSelf: 'center',
      borderRadius: 22,
      padding: 16,
      backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.9)' : colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    hero: {
      gap: 8,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.65)' : colors.inputBackground,
    },
    heroBadge: {
      alignSelf: 'flex-start',
      color: colors.text,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: Platform.OS === 'web' ? 'rgba(18,126,255,0.12)' : colors.cardBackground,
    },
    title: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.text,
      lineHeight: 34,
    },
    subtitle: {
      color: colors.secondaryText,
      fontSize: 15,
      lineHeight: 20,
    },
    loaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 4,
    },
    loaderText: {
      color: colors.secondaryText,
      fontSize: 13,
      fontWeight: '600',
    },
    alertError: {
      borderWidth: 1,
      borderColor: colors.error,
      borderRadius: 12,
      backgroundColor: Platform.OS === 'web' ? 'rgba(223, 60, 60, 0.08)' : colors.inputBackground,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    alertInfo: {
      borderWidth: 1,
      borderColor: colors.info,
      borderRadius: 12,
      backgroundColor: Platform.OS === 'web' ? 'rgba(0, 154, 255, 0.08)' : colors.inputBackground,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    error: {
      color: colors.error,
      fontWeight: '700',
    },
    notice: {
      color: colors.info,
      fontWeight: '700',
    },
    section: {
      gap: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 16,
      backgroundColor: colors.inputBackground,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '800',
    },
    sectionText: {
      color: colors.secondaryText,
      fontSize: 14,
      lineHeight: 20,
    },
    hintWrap: {
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.55)' : colors.cardBackground,
    },
    hintText: {
      color: colors.secondaryText,
      fontSize: 12,
      fontWeight: '600',
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
      fontSize: 15,
    },
    linkBtn: {
      marginTop: 2,
      paddingVertical: 6,
    },
    linkBtnText: {
      color: colors.secondaryText,
      fontWeight: '700',
      textDecorationLine: 'underline',
      fontSize: 13,
    },
  });
