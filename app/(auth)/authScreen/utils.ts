import type { MessengerQrAuthProvider } from '@/types/apiTypes';

export function validateEmail(email: string) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.toLowerCase());
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function passwordScore(password: string) {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

export function normalizeError(err: any): string {
  const raw = err?.message || (typeof err === 'string' ? err : '');
  if (/network request failed|failed to fetch|network error/i.test(raw)) {
    return 'Нет соединения с сервером';
  }
  return raw || 'Произошла ошибка. Попробуйте снова.';
}

export function providerLabel(provider: MessengerQrAuthProvider) {
  return provider === 'MAX' ? 'MAX' : 'Telegram';
}

export function mapQrFailureReason(
  failureReason?: string | null,
  provider: MessengerQrAuthProvider = 'TELEGRAM'
) {
  const reason = String(failureReason || '').trim().toUpperCase();
  if (!reason) return `Не удалось завершить вход через ${providerLabel(provider)}.`;
  if (reason === 'ACCOUNT_CONFLICT') {
    return `Этот ${providerLabel(provider)}-аккаунт уже связан с другим профилем. Войдите по email/паролю и привяжите мессенджер в профиле.`;
  }
  if (reason === 'SESSION_EXPIRED') {
    return 'QR-сессия истекла. Запустите вход заново.';
  }
  if (reason === 'CANCELLED_BY_USER') {
    return 'Вход через QR отменён.';
  }
  if (reason === 'INVALID_PHONE') {
    return `Не удалось получить корректный номер из ${providerLabel(provider)}. Повторите сканирование.`;
  }
  return `Не удалось завершить вход через ${providerLabel(provider)}.`;
}
