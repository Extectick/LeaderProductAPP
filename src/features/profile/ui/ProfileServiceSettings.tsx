import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import type { Profile } from '@/src/entities/user/types';
import { addCredentials, changePassword, requestPasswordReset, resendVerification, verify, verifyPasswordReset } from '@/utils/authService';
import { useTracking } from '@/context/TrackingContextV2';
import { openTrackingSettings, requestTrackingPermissions } from '@/utils/trackingV2Service';
import { ProfileTrackingSettings } from './ProfileTrackingSettings';
import { ProfileAction, ProfileFact, ProfileField } from './ProfileSettingsPrimitives';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { getTrackingAdminHealth, type TrackingAdminHealth } from '@/utils/trackingApi';
import OTP6Input from '@/components/OTP6Input';
import { isValidEmail } from '@/src/features/profile/lib/verification';

// Keep the established verification and native tracking flows separate from the profile landing page.
type CredentialsStep = 'credentials' | 'verify';

type ResolvedAuthMethods = {
  telegramLinked: boolean;
  maxLinked: boolean;
  passwordLoginEnabled: boolean;
  passwordLoginPendingVerification: boolean;
};

function resolveAuthMethods(profile: Profile | null): ResolvedAuthMethods {
  const fromApi = profile?.authMethods;
  if (fromApi) {
    return {
      telegramLinked: Boolean(fromApi.telegramLinked),
      maxLinked: Boolean(fromApi.maxLinked),
      passwordLoginEnabled: Boolean(fromApi.passwordLoginEnabled),
      passwordLoginPendingVerification: Boolean(fromApi.passwordLoginPendingVerification),
    };
  }

  return {
    telegramLinked: Boolean(profile?.telegramId),
    maxLinked: Boolean(profile?.maxId),
    passwordLoginEnabled: false,
    passwordLoginPendingVerification: false,
  };
}


export function CredentialsSection({
  profile,
  onAdded,
}: {
  profile: Profile | null;
  onAdded: () => Promise<void>;
}) {
  const authMethods = resolveAuthMethods(profile);
  const shouldShowSetup = (authMethods.telegramLinked || authMethods.maxLinked) && !authMethods.passwordLoginEnabled;
  const emailFromProfile = (profile?.email || '').trim().toLowerCase();
  const hasLinkedEmail = isValidEmail(emailFromProfile);
  const canResetPassword = authMethods.passwordLoginEnabled && hasLinkedEmail;

  const [step, setStep] = useState<CredentialsStep>('credentials');
  const [showCompletion, setShowCompletion] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetModalStep, setResetModalStep] = useState<0 | 1>(0);
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordRepeat, setResetPasswordRepeat] = useState('');
  const [resetModalBusy, setResetModalBusy] = useState(false);
  const [resetResending, setResetResending] = useState(false);
  const [resetResendTimer, setResetResendTimer] = useState(0);
  const [resetModalNotice, setResetModalNotice] = useState<string | null>(null);
  const [resetModalError, setResetModalError] = useState<string | null>(null);
  const resetVerifyInFlightRef = useRef(false);
  const lastAutoVerifyCodeRef = useRef('');

  useEffect(() => {
    if (!profile) return;

    if (authMethods.passwordLoginPendingVerification && emailFromProfile) {
      setShowCompletion(false);
      setStep('verify');
      setEmail(emailFromProfile);
      return;
    }

    setShowCompletion(false);
    setStep('credentials');
  }, [
    profile,
    emailFromProfile,
    authMethods.passwordLoginEnabled,
    authMethods.passwordLoginPendingVerification,
  ]);

  useEffect(() => {
    if (!resetModalVisible || resetResendTimer <= 0) return;
    const t = setTimeout(() => setResetResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resetModalVisible, resetResendTimer]);

  useEffect(() => {
    if (resetCode.length < 6) {
      lastAutoVerifyCodeRef.current = '';
    }
  }, [resetCode]);

  useEffect(() => {
    if (!resetModalVisible || resetModalStep !== 0) {
      resetVerifyInFlightRef.current = false;
      lastAutoVerifyCodeRef.current = '';
    }
  }, [resetModalStep, resetModalVisible]);

  if (!profile || (!shouldShowSetup && !showCompletion && !canResetPassword)) return null;

  const normalizedEmail = email.trim().toLowerCase();
  const verificationEmail = emailFromProfile || normalizedEmail;
  const emailValid = isValidEmail(normalizedEmail);
  const passwordValid = password.trim().length >= 6;
  const codeValid = /^\d{6}$/.test(code.trim());

  const onSubmitCredentials = async () => {
    if (!emailValid || !passwordValid) {
      Alert.alert('Ошибка', 'Укажите корректный email и пароль не менее 6 символов');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await addCredentials(normalizedEmail, password.trim());
      setNotice('Email и пароль сохранены. Введите код из письма.');
      setStep('verify');
      setEmail(normalizedEmail);
      setPassword('');
      await onAdded();
    } catch (e: any) {
      setError(e?.message || 'Не удалось добавить email и пароль');
    } finally {
      setSaving(false);
    }
  };

  const onSubmitVerification = async () => {
    if (!verificationEmail || !isValidEmail(verificationEmail)) {
      setError('Не удалось определить email для подтверждения');
      return;
    }
    if (!codeValid) {
      setError('Введите 6-значный код из письма');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await verify(verificationEmail, code.trim());
      await onAdded();
      setCode('');
      setShowCompletion(true);
      setNotice('Вход по email/паролю активирован.');
    } catch (e: any) {
      setError(e?.message || 'Не удалось подтвердить email');
    } finally {
      setSaving(false);
    }
  };

  const onResendCode = async () => {
    if (!verificationEmail || !isValidEmail(verificationEmail)) {
      setError('Не удалось определить email для повторной отправки');
      return;
    }
    setResending(true);
    setError(null);
    try {
      await resendVerification(verificationEmail);
      setNotice('Код подтверждения отправлен повторно.');
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить код повторно');
    } finally {
      setResending(false);
    }
  };

  const onRequestPasswordReset = async () => {
    if (!canResetPassword || !emailFromProfile) return;
    setResetting(true);
    setError(null);
    setNotice(null);
    try {
      await requestPasswordReset(emailFromProfile);
      setResetModalVisible(true);
      setResetModalStep(0);
      setResetCode('');
      setResetPassword('');
      setResetPasswordRepeat('');
      setResetModalError(null);
      setResetResendTimer(30);
      setResetModalNotice(`Код для сброса пароля отправлен на ${emailFromProfile}.`);
      setNotice(`Код для сброса пароля отправлен на ${emailFromProfile}.`);
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить код для сброса пароля');
    } finally {
      setResetting(false);
    }
  };

  const onResetCodeChange = (value: string) => {
    const only = value.replace(/\D/g, '').slice(0, 6);
    setResetCode(only);
    if (resetModalError) setResetModalError(null);
  };

  const readClipboardTextSafe = async () => {
    try {
      const fromExpo = await Clipboard.getStringAsync();
      if (fromExpo) return String(fromExpo);
    } catch {}

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator?.clipboard?.readText) {
      try {
        return await navigator.clipboard.readText();
      } catch {}
    }
    return '';
  };

  const onPasteResetCode = async () => {
    try {
      const text = await readClipboardTextSafe();
      const only = String(text || '').replace(/\D/g, '').slice(0, 6);
      if (!only) {
        setResetModalError('Не удалось вставить код из буфера');
        return;
      }
      setResetCode(only);
      setResetModalError(null);
    } catch {
      setResetModalError('Не удалось вставить код из буфера');
    }
  };

  const onVerifyResetCode = async (otp?: string, source: 'auto' | 'manual' = 'manual') => {
    const codeValue = String(otp || resetCode || '').trim();
    if (!/^\d{6}$/.test(codeValue)) {
      setResetModalError('Введите 6-значный код из письма');
      return;
    }
    if (!emailFromProfile || !isValidEmail(emailFromProfile)) {
      setResetModalError('Не удалось определить email для подтверждения');
      return;
    }
    if (resetVerifyInFlightRef.current || resetModalBusy) return;
    if (source === 'auto' && lastAutoVerifyCodeRef.current === codeValue) return;

    resetVerifyInFlightRef.current = true;
    if (source === 'auto') {
      lastAutoVerifyCodeRef.current = codeValue;
    }
    setResetModalBusy(true);
    setResetModalError(null);
    setResetModalNotice(null);
    try {
      await verifyPasswordReset(emailFromProfile, codeValue);
      setResetCode(codeValue);
      setResetModalStep(1);
      setResetModalNotice('Код подтверждён. Укажите новый пароль.');
    } catch (e: any) {
      setResetModalError(e?.message || 'Не удалось подтвердить код');
    } finally {
      resetVerifyInFlightRef.current = false;
      setResetModalBusy(false);
    }
  };

  const onResendResetCode = async () => {
    if (!emailFromProfile || !isValidEmail(emailFromProfile)) {
      setResetModalError('Не удалось определить email для повторной отправки');
      return;
    }
    if (resetResendTimer > 0) return;
    setResetResending(true);
    setResetModalError(null);
    try {
      await requestPasswordReset(emailFromProfile);
      setResetCode('');
      lastAutoVerifyCodeRef.current = '';
      setResetResendTimer(30);
      setResetModalNotice(`Код для сброса пароля отправлен повторно на ${emailFromProfile}.`);
    } catch (e: any) {
      setResetModalError(e?.message || 'Не удалось отправить код повторно');
    } finally {
      setResetResending(false);
    }
  };

  const onSubmitNewPassword = async () => {
    const nextPassword = resetPassword.trim();
    const repeatPassword = resetPasswordRepeat.trim();
    if (nextPassword.length < 6) {
      setResetModalError('Новый пароль должен быть не короче 6 символов');
      return;
    }
    if (!repeatPassword) {
      setResetModalError('Повторите новый пароль');
      return;
    }
    if (nextPassword !== repeatPassword) {
      setResetModalError('Пароли не совпадают');
      return;
    }
    if (!/^\d{6}$/.test(resetCode)) {
      setResetModalError('Код подтверждения недействителен, запросите новый');
      setResetModalStep(0);
      return;
    }
    if (!emailFromProfile || !isValidEmail(emailFromProfile)) {
      setResetModalError('Не удалось определить email');
      return;
    }
    setResetModalBusy(true);
    setResetModalError(null);
    setResetModalNotice(null);
    try {
      await changePassword(emailFromProfile, resetCode, nextPassword);
      setResetModalVisible(false);
      setResetModalStep(0);
      setResetCode('');
      setResetPassword('');
      setResetPasswordRepeat('');
      setResetResendTimer(0);
      setResetModalNotice(null);
      setNotice('Пароль успешно изменён.');
    } catch (e: any) {
      setResetModalError(e?.message || 'Не удалось изменить пароль');
    } finally {
      setResetModalBusy(false);
    }
  };

  const onCloseResetModal = () => {
    if (resetModalBusy || resetResending) return;
    setResetModalVisible(false);
    setResetModalStep(0);
    setResetCode('');
    setResetPassword('');
    setResetPasswordRepeat('');
    setResetResendTimer(0);
    setResetModalError(null);
    setResetModalNotice(null);
  };

  return (
    <>
      <View>
        <ProfileFact title="Вход по паролю" value={authMethods.passwordLoginEnabled ? emailFromProfile : 'Не подключён'} icon="key-outline" />
        {error ? <Text style={styles.credentialsError}>{error}</Text> : null}
        {notice ? <Text style={styles.credentialsNotice}>{notice}</Text> : null}
        {!showCompletion && shouldShowSetup && step === 'credentials' ? <>
          <ProfileField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <ProfileField label="Пароль" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
          <ProfileAction onPress={onSubmitCredentials} disabled={saving} loading={saving}>Добавить email и пароль</ProfileAction>
        </> : null}
        {!showCompletion && shouldShowSetup && step === 'verify' ? <>
          <Text style={styles.credentialsHint}>Подтвердите email {verificationEmail || '—'} кодом из письма.</Text>
          <ProfileField label="Код из 6 цифр" value={code} keyboardType="number-pad"
            onChangeText={value => setCode(value.replace(/\D+/g, '').slice(0, 6))} />
          <ProfileAction onPress={onSubmitVerification} disabled={saving} loading={saving}>Подтвердить email</ProfileAction>
          <ProfileAction mode="text" onPress={onResendCode} disabled={resending || saving} loading={resending}>Отправить код повторно</ProfileAction>
        </> : null}
        {showCompletion ? <Text style={styles.credentialsDoneText}>Вход по email/паролю активирован.</Text> : null}
        {canResetPassword ? <ProfileFact title="Сбросить пароль" value={resetting ? 'Отправляем код…' : 'Подтверждение через email'} icon="lock-reset"
          onPress={resetting || saving || resending ? undefined : onRequestPasswordReset} /> : null}
      </View>

      <Modal visible={resetModalVisible} transparent animationType="fade" onRequestClose={onCloseResetModal}>
        <View style={styles.resetModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onCloseResetModal} />
          <View style={styles.resetModalCard}>
            <Text style={styles.credentialsTitle}>Сброс пароля</Text>
            <Text style={styles.credentialsSubtitle}>
              {resetModalStep === 0
                ? `Введите код из письма для ${emailFromProfile}.`
                : `Укажите новый пароль для ${emailFromProfile}.`}
            </Text>

            {resetModalError ? <Text style={styles.credentialsError}>{resetModalError}</Text> : null}
            {resetModalNotice ? <Text style={styles.credentialsNotice}>{resetModalNotice}</Text> : null}

            {resetModalStep === 0 ? (
              <>
                <OTP6Input
                  value={resetCode}
                  onChange={onResetCodeChange}
                  onFilled={(value) => {
                    void onVerifyResetCode(value, 'auto');
                  }}
                  disabled={resetModalBusy}
                  error={Boolean(resetModalError)}
                  secure={false}
                  autoFocus
                />
                <View style={styles.resetModalActions}>
                  <Pressable
                    onPress={() => {
                      void onPasteResetCode();
                    }}
                    disabled={resetModalBusy || resetResending}
                    style={({ pressed }) => [
                      styles.credentialsSecondaryButton,
                      (resetModalBusy || resetResending) && styles.credentialsButtonDisabled,
                      pressed && !(resetModalBusy || resetResending) ? styles.credentialsSecondaryButtonPressed : null,
                    ]}
                  >
                    <Text style={styles.credentialsSecondaryButtonText}>Вставить код</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void onResendResetCode();
                    }}
                    disabled={resetModalBusy || resetResending || resetResendTimer > 0}
                    style={({ pressed }) => [
                      styles.credentialsSecondaryButton,
                      (resetModalBusy || resetResending || resetResendTimer > 0) && styles.credentialsButtonDisabled,
                      pressed && !(resetModalBusy || resetResending || resetResendTimer > 0)
                        ? styles.credentialsSecondaryButtonPressed
                        : null,
                    ]}
                  >
                    <Text style={styles.credentialsSecondaryButtonText}>
                      {resetResending
                        ? 'Отправка...'
                        : resetResendTimer > 0
                        ? `Повторно через ${resetResendTimer}с`
                        : 'Отправить код повторно'}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.resetModalActions}>
                  <Pressable
                    onPress={() => {
                      void onVerifyResetCode();
                    }}
                    disabled={resetModalBusy || resetResending}
                    style={({ pressed }) => [
                      styles.credentialsButton,
                      (resetModalBusy || resetResending) && styles.credentialsButtonDisabled,
                      pressed && !(resetModalBusy || resetResending) ? styles.credentialsButtonPressed : null,
                    ]}
                  >
                    <Text style={styles.credentialsButtonText}>
                      {resetModalBusy ? 'Проверка...' : 'Подтвердить код'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={onCloseResetModal}
                    disabled={resetModalBusy || resetResending}
                    style={({ pressed }) => [
                      styles.credentialsSecondaryButton,
                      (resetModalBusy || resetResending) && styles.credentialsButtonDisabled,
                      pressed && !(resetModalBusy || resetResending) ? styles.credentialsSecondaryButtonPressed : null,
                    ]}
                  >
                    <Text style={styles.credentialsSecondaryButtonText}>Отмена</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <ProfileField
                  value={resetPassword}
                  onChangeText={setResetPassword}
                  label="Новый пароль"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <ProfileField
                  value={resetPasswordRepeat}
                  onChangeText={setResetPasswordRepeat}
                  label="Повторите пароль"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.resetModalActions}>
                  <Pressable
                    onPress={() => {
                      void onSubmitNewPassword();
                    }}
                    disabled={resetModalBusy}
                    style={({ pressed }) => [
                      styles.credentialsButton,
                      resetModalBusy && styles.credentialsButtonDisabled,
                      pressed && !resetModalBusy ? styles.credentialsButtonPressed : null,
                    ]}
                  >
                    <Text style={styles.credentialsButtonText}>
                      {resetModalBusy ? 'Сохранение...' : 'Сохранить пароль'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (resetModalBusy) return;
                      setResetModalStep(0);
                      setResetModalError(null);
                    }}
                    disabled={resetModalBusy}
                    style={({ pressed }) => [
                      styles.credentialsSecondaryButton,
                      resetModalBusy && styles.credentialsButtonDisabled,
                      pressed && !resetModalBusy ? styles.credentialsSecondaryButtonPressed : null,
                    ]}
                  >
                    <Text style={styles.credentialsSecondaryButtonText}>Назад</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

export function TrackingToggle() {
  const tracking = useTracking();
  useEffect(() => { void tracking.refreshTrackingStatus().catch(() => undefined); }, [tracking.refreshTrackingStatus]);
  const [loading, setLoading] = useState(false);
  const lock = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setLoading(true);
    try { await action(); }
    catch (error) { Alert.alert('Геолокация', error instanceof Error ? error.message : 'Не удалось изменить настройки'); }
    finally {
      try { await tracking.refreshTrackingStatus(); } catch { /* Keep last known state until the next check. */ }
      lock.current = false; setLoading(false);
    }
  };
  return <ProfileTrackingSettings diagnostics={tracking.reliability} enabled={tracking.trackingEnabled}
    status={tracking.trackingStatusText} lastSentAt={tracking.lastUploadAt}
    busy={loading || tracking.trackingStatus === 'starting' || tracking.trackingStatus === 'stopping'}
    onToggle={() => void run(async () => { if (tracking.trackingEnabled) await tracking.stopTracking(); else await tracking.startTracking(); })}
    onSetup={action => void run(async () => {
      if (action === 'permissions') {
        if (!(await requestTrackingPermissions())) await openTrackingSettings('app');
      } else await openTrackingSettings(action);
    })}
    onRefresh={() => void run(tracking.refreshTrackingStatus)} />;
}

export function TrackingAdminHealthCard() {
  const { isAdmin } = useIsAdmin();
  const [health, setHealth] = useState<TrackingAdminHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const response = await getTrackingAdminHealth();
      if (!response.ok || !response.data) {
        setError(response.message || 'Не удалось получить состояние устройств');
        return;
      }
      setHealth(response.data);
    } catch {
      setError('Не удалось получить состояние устройств');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  if (!isAdmin) return null;
  const summary = health?.summary;
  const tone = (summary?.staleDevices || 0) > 0 || (summary?.tokenIssuesLastHour || 0) > 3
    ? '#B45309'
    : '#15803D';

  return <ProfileFact title="Состояние устройств" value={summary
    ? `Устройств: ${summary.activeDevices} · без связи: ${summary.staleDevices} · выдач токена за час: ${summary.tokenIssuesLastHour}`
    : error || 'Загружаем состояние устройств…'} icon="pulse"
    right={() => <IconButton icon="refresh" iconColor={tone} loading={loading} disabled={loading}
      accessibilityLabel="Обновить состояние трекинга" onPress={() => void refresh()} />} />;
}

const styles = StyleSheet.create({
credentialsTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
credentialsSubtitle: { fontSize: 12, color: '#64748B' },
credentialsHint: { fontSize: 12, color: '#374151' },
credentialsError: { color: '#B91C1C', fontWeight: '700', fontSize: 12 },
credentialsNotice: { color: '#1D4ED8', fontWeight: '700', fontSize: 12 },
credentialsButton: {
    marginTop: 4,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: '#2563EB',
  },
credentialsButtonPressed: {
    backgroundColor: '#2563EB',
  },
credentialsButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
credentialsButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
credentialsSecondaryButton: {
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 0,
    borderColor: '#C7D2FE',
  },
credentialsSecondaryButtonPressed: {
    backgroundColor: '#E0E7FF',
  },
credentialsSecondaryButtonText: {
    color: '#3730A3',
    fontWeight: '700',
  },
resetModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.56)',
    padding: 16,
  },
resetModalCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 16,
    borderWidth: 0,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 10,
  },
resetModalActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
credentialsDoneText: {
    color: '#166534',
    fontWeight: '700',
  }
});
