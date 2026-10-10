import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button as PaperButton, Switch } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import type { Profile } from '@/src/entities/user/types';
import { addCredentials, changePassword, requestPasswordReset, resendVerification, verify, verifyPasswordReset } from '@/utils/authService';
import { useTracking } from '@/context/TrackingContextV2';
import { openTrackingSettings, restoreTrackingV2 } from '@/utils/trackingV2Service';
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
      <View style={styles.credentialsCard}>
        <View style={styles.settingsHeader}>
          <View style={styles.settingsIcon}>
            <Ionicons name="key-outline" size={17} color="#1E293B" />
          </View>
          <Text style={styles.settingsTitle}>Безопасность</Text>
        </View>
        {error ? <Text style={styles.credentialsError}>{error}</Text> : null}
        {notice ? <Text style={styles.credentialsNotice}>{notice}</Text> : null}

      {!showCompletion && shouldShowSetup && step === 'credentials' ? (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            style={styles.fieldInput}
            placeholder="example@mail.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={styles.fieldInput}
            placeholder="Пароль"
            secureTextEntry
          />
          <Pressable
            onPress={onSubmitCredentials}
            disabled={saving}
            style={({ pressed }) => [
              styles.credentialsButton,
              saving && styles.credentialsButtonDisabled,
              pressed && !saving ? styles.credentialsButtonPressed : null,
            ]}
          >
            <Text style={styles.credentialsButtonText}>
              {saving ? 'Сохранение...' : 'Добавить email и пароль'}
            </Text>
          </Pressable>
        </>
      ) : null}

      {!showCompletion && shouldShowSetup && step === 'verify' ? (
        <>
          <Text style={styles.credentialsHint}>
            Подтвердите email {verificationEmail || '—'} кодом из письма.
          </Text>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D+/g, '').slice(0, 6))}
            style={styles.fieldInput}
            placeholder="Код из 6 цифр"
            keyboardType="number-pad"
          />
          <Pressable
            onPress={onSubmitVerification}
            disabled={saving}
            style={({ pressed }) => [
              styles.credentialsButton,
              saving && styles.credentialsButtonDisabled,
              pressed && !saving ? styles.credentialsButtonPressed : null,
            ]}
          >
            <Text style={styles.credentialsButtonText}>
              {saving ? 'Проверка...' : 'Подтвердить email'}
            </Text>
          </Pressable>
          <Pressable
            onPress={onResendCode}
            disabled={resending || saving}
            style={({ pressed }) => [
              styles.credentialsSecondaryButton,
              (resending || saving) && styles.credentialsButtonDisabled,
              pressed && !(resending || saving) ? styles.credentialsSecondaryButtonPressed : null,
            ]}
          >
            <Text style={styles.credentialsSecondaryButtonText}>
              {resending ? 'Отправка...' : 'Отправить код повторно'}
            </Text>
          </Pressable>
        </>
      ) : null}

      {showCompletion ? (
        <View style={styles.credentialsDoneWrap}>
          <Text style={styles.credentialsDoneText}>Вход по email/паролю активирован.</Text>
        </View>
      ) : null}

        {canResetPassword ? (
          <>
            <Pressable
              onPress={onRequestPasswordReset}
              disabled={resetting || saving || resending}
              style={({ pressed }) => [
                styles.credentialsResetButton,
                (resetting || saving || resending) && styles.credentialsButtonDisabled,
                pressed && !(resetting || saving || resending) ? styles.credentialsResetButtonPressed : null,
              ]}
            >
              <Text style={styles.credentialsResetButtonText}>
                {resetting ? 'Отправка...' : 'Сбросить пароль'}
              </Text>
            </Pressable>
          </>
        ) : null}
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
                <TextInput
                  value={resetPassword}
                  onChangeText={setResetPassword}
                  style={styles.fieldInput}
                  placeholder="Новый пароль"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  value={resetPasswordRepeat}
                  onChangeText={setResetPasswordRepeat}
                  style={styles.fieldInput}
                  placeholder="Повторите пароль"
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
  const {
    trackingEnabled,
    trackingStatus,
    trackingStatusText,
    queueLength,
    lastUploadAt,
    lastError,
    trackingMode,
    nativeDiagnostics,
    reliability,
    refreshTrackingStatus,
    startTracking,
    stopTracking,
  } = useTracking();
  const [loading, setLoading] = useState(false);

  const openSettings = async (kind: 'battery' | 'location' | 'app') => {
    try { await openTrackingSettings(kind); }
    catch { Alert.alert('Настройки', 'Откройте настройки приложения вручную в настройках Android'); }
  };
  const repair = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await restoreTrackingV2();
      await refreshTrackingStatus();
    } catch (error) { Alert.alert('Отслеживание', error instanceof Error ? error.message : 'Не удалось восстановить сервис'); }
    finally { setLoading(false); }
  };

  const onToggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (trackingEnabled) {
        await stopTracking();
      } else {
        await startTracking();
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message ?? 'Не удалось изменить состояние трекинга');
    } finally {
      setLoading(false);
    }
  };

  const lastUploadLabel = lastUploadAt
    ? new Date(lastUploadAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : null;
  const lastRecordedLabel = nativeDiagnostics.lastRecordedAt
    ? new Date(nativeDiagnostics.lastRecordedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : null;
  const modeLabel =
    trackingMode === 'native'
      ? 'Фоновый сервис Android'
      : trackingMode === 'fallback'
        ? 'Резервный режим приложения'
        : 'Не запущен';
  const statusColor =
    trackingStatus === 'tracking'
      ? '#15803D'
      : trackingStatus === 'uploading'
        ? '#2563EB'
        : trackingStatus === 'idle'
          ? '#64748B'
          : '#B45309';

  return (
    <View style={styles.trackingRow}>
      <View style={styles.settingsIcon}>
        <Ionicons name="navigate-outline" size={17} color={statusColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.trackingTitle}>Отслеживание маршрута</Text>
        <Text style={styles.trackingSubtitle}>{trackingStatusText}</Text>
        <View style={styles.trackingMetaRow}>
          {trackingEnabled ? (
            <View style={styles.trackingChip}>
              <Ionicons name={trackingMode === 'native' ? 'shield-checkmark-outline' : 'phone-portrait-outline'} size={12} color="#475569" />
              <Text style={styles.trackingChipText}>{modeLabel}</Text>
            </View>
          ) : null}
          {queueLength !== null ? (
            <View style={styles.trackingChip}>
              <Ionicons name="cloud-upload-outline" size={12} color="#475569" />
              <Text style={styles.trackingChipText}>
                {queueLength > 0 ? `Очередь: ${queueLength}` : 'Очередь пуста'}
              </Text>
            </View>
          ) : null}
          {lastUploadLabel ? (
            <View style={styles.trackingChip}>
              <Ionicons name="time-outline" size={12} color="#475569" />
              <Text style={styles.trackingChipText}>Связь с API {lastUploadLabel}</Text>
            </View>
          ) : null}
          {lastRecordedLabel ? (
            <View style={styles.trackingChip}>
              <Ionicons name="locate-outline" size={12} color="#475569" />
              <Text style={styles.trackingChipText}>Точка {lastRecordedLabel}</Text>
            </View>
          ) : null}
        </View>
        {trackingStatus === 'waitingNetwork' && nativeDiagnostics.nextRetryAt ? (
          <Text style={styles.trackingRetry}>
            Следующая попытка отправки {new Date(nativeDiagnostics.nextRetryAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        ) : null}
        {nativeDiagnostics.discardedPoints > 0 ? (
          <Text style={styles.trackingDetail}>
            Отфильтровано неточных или повторных точек: {nativeDiagnostics.discardedPoints}
          </Text>
        ) : null}
        {lastError ? <Text style={styles.trackingError}>{lastError}</Text> : null}
        {trackingEnabled && Platform.OS === 'android' ? (
          <>
            <Text style={styles.trackingDetail}>
              {reliability.batteryOptimizationExempt === true ? 'Батарея: ограничения Android сняты' : reliability.batteryOptimizationExempt === false ? 'Батарея: Android может задерживать геопозицию' : 'Проверка батареи доступна в новом APK'}
              {reliability.powerSaveMode ? '\nВключён режим энергосбережения телефона' : ''}
              {reliability.notificationsEnabled === false ? '\nУведомление скрыто — разрешите уведомления приложения' : ''}
              {reliability.preciseLocation === false ? '\nРазрешена только приблизительная геопозиция' : ''}
            </Text>
            {reliability.lastCommandPollAt ? (
              <Text style={styles.trackingDetail}>Команды API: {new Date(reliability.lastCommandPollAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · это не время координаты</Text>
            ) : <Text style={styles.trackingDetail}>Канал команд: {reliability.commandsRunning ? 'соединяемся' : 'соединение не подтверждено'}</Text>}
            {reliability.batteryOptimizationExempt !== true || reliability.powerSaveMode ? (
              <PaperButton compact icon="battery-outline" onPress={() => void openSettings('battery')}>Настроить батарею</PaperButton>
            ) : null}
            {!reliability.locationServicesEnabled ? <PaperButton compact icon="crosshairs-gps" onPress={() => void openSettings('location')}>Включить геолокацию</PaperButton> : null}
            {reliability.notificationsEnabled === false || reliability.preciseLocation === false || trackingStatus === 'permissionDenied' ? <PaperButton compact icon="cog-outline" onPress={() => void openSettings('app')}>Разрешения приложения</PaperButton> : null}
            <PaperButton compact icon="refresh" disabled={loading} loading={loading} onPress={() => void repair()}>Проверить и восстановить</PaperButton>
            <Text style={styles.trackingDetail}>Для работы в фоне выберите батарею «Без ограничений». Если в телефоне есть настройка автозапуска — разрешите её. После принудительной остановки нужно снова открыть приложение.</Text>
          </>
        ) : null}
        {(trackingStatus === 'permissionDenied' || trackingStatus === 'serviceDenied' || trackingStatus === 'error') ? (
          <Pressable
            style={styles.trackingSettingsButton}
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Открыть системные настройки приложения"
          >
            <Ionicons name="settings-outline" size={15} color="#2563EB" />
            <Text style={styles.trackingSettingsButtonText}>Открыть настройки Android</Text>
          </Pressable>
        ) : null}
      </View>
      <Switch value={trackingEnabled} onValueChange={onToggle} disabled={loading} />
    </View>
  );
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

  return (
    <View style={styles.trackingAdminRow}>
      <View style={[styles.settingsIcon, { backgroundColor: tone === '#15803D' ? '#ECFDF5' : '#FFFBEB' }]}>
        <Ionicons name="pulse-outline" size={17} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.trackingTitle}>Состояние трекинга</Text>
        <Text style={styles.trackingSubtitle}>
          {summary
            ? `Устройств: ${summary.activeDevices} · без связи: ${summary.staleDevices} · выдач токена за час: ${summary.tokenIssuesLastHour}`
            : error || 'Загружаем состояние устройств…'}
        </Text>
      </View>
      <Pressable
        onPress={() => void refresh()}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Обновить состояние трекинга"
        hitSlop={8}
        style={styles.trackingHealthRefresh}
      >
        {loading ? <ActivityIndicator size="small" color={tone} /> : <Ionicons name="refresh-outline" size={18} color={tone} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
trackingRow: {
    paddingHorizontal: 0,
    paddingVertical: 13,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
trackingAdminRow: {
    paddingHorizontal: 0,
    paddingVertical: 11,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
trackingSettingsButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
  },
trackingSettingsButtonText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
  },
trackingHealthRefresh: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
trackingTitle: { fontWeight: '800', fontSize: 14, color: '#0F172A', marginBottom: 3 },
trackingSubtitle: { fontSize: 12, color: '#64748B', lineHeight: 16 },
trackingMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
trackingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
trackingChipText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
trackingError: {
    marginTop: 7,
    color: '#B45309',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
trackingRetry: {
    marginTop: 7,
    color: '#475569',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
trackingDetail: {
    marginTop: 5,
    color: '#64748B',
    fontSize: 11,
    lineHeight: 15,
  },
settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 2,
  },
settingsIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
settingsTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
fieldInput: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderWidth: 0,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
  },
credentialsCard: {
    paddingHorizontal: 0,
    paddingVertical: 13,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 11,
  },
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
credentialsResetButton: {
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 0,
    borderColor: '#2563EB',
  },
credentialsResetButtonPressed: {
    backgroundColor: '#DBEAFE',
  },
credentialsResetButtonText: {
    color: '#1D4ED8',
    fontWeight: '800',
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
credentialsDoneWrap: {
    borderRadius: 10,
    borderWidth: 0,
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
credentialsDoneText: {
    color: '#166534',
    fontWeight: '700',
  }
});
