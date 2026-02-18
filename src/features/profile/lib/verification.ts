import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { Profile } from '@/src/entities/user/types';

export type PhoneVerificationProvider = 'TELEGRAM' | 'MAX';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string) {
  return EMAIL_RE.test(String(email || '').trim().toLowerCase());
}

export function resolvePreferredPhoneProvider(profile: Profile | null): PhoneVerificationProvider {
  const hasTelegram = Boolean(profile?.authMethods?.telegramLinked ?? profile?.telegramId);
  const hasMax = Boolean(profile?.authMethods?.maxLinked ?? profile?.maxId);
  if (hasMax && !hasTelegram) return 'MAX';
  return 'TELEGRAM';
}

export function isValidPhoneVerificationDeepLink(url: string, provider: PhoneVerificationProvider) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  if (provider === 'MAX') {
    return /^https:\/\/max\.ru\/.+\?start=verify_phone_[A-Za-z0-9_-]+$/.test(raw);
  }
  return /^https:\/\/t\.me\/.+\?start=verify_phone_[A-Za-z0-9_-]+$/.test(raw);
}

export function providerLabel(provider: PhoneVerificationProvider) {
  return provider === 'MAX' ? 'MAX' : 'Telegram';
}

export function mapPhoneVerificationReason(reason?: string | null, provider: PhoneVerificationProvider = 'TELEGRAM') {
  if (!reason) return 'Не удалось подтвердить телефон';
  if (reason === 'PHONE_MISMATCH') return `Номер из ${providerLabel(provider)} не совпал с введённым номером`;
  if (reason === 'PHONE_ALREADY_USED') return 'Этот номер уже используется другим пользователем';
  if (reason === 'TELEGRAM_ALREADY_USED') return 'Этот Telegram уже привязан к другому пользователю';
  if (reason === 'MAX_ALREADY_USED') return 'Этот MAX уже привязан к другому пользователю';
  if (reason === 'SESSION_EXPIRED') return 'Сессия подтверждения истекла';
  return 'Не удалось подтвердить телефон';
}

export async function openPhoneVerificationDeepLink(url: string, provider: PhoneVerificationProvider) {
  if (!url) throw new Error(`${providerLabel(provider)} ссылка не получена. Проверьте настройки сервера.`);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}


