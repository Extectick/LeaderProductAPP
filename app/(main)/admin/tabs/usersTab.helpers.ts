import type { ProfileStatus, ProfileType } from '@/src/entities/user/types';
import type { AdminModerationState, AdminUsersListItem } from '@/utils/userService';

export type UsersModerationFilterKey = 'all' | AdminModerationState;
export type UsersOnlineFilterKey = 'all' | 'online' | 'offline';

export const moderationFilters: Array<{ key: UsersModerationFilterKey; label: string }> = [
  { key: 'all', label: 'Все статусы' },
  { key: 'EMPLOYEE_PENDING', label: 'На проверке' },
  { key: 'EMPLOYEE_ACTIVE', label: 'Подтвержденные' },
  { key: 'EMPLOYEE_BLOCKED', label: 'Отклоненные' },
  { key: 'NO_EMPLOYEE_PROFILE', label: 'Без профиля сотрудника' },
];

export const onlineFilters: Array<{ key: UsersOnlineFilterKey; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'online', label: 'Онлайн' },
  { key: 'offline', label: 'Оффлайн' },
];

export function moderationLabel(state: AdminModerationState) {
  if (state === 'EMPLOYEE_ACTIVE') return 'Подтвержден';
  if (state === 'EMPLOYEE_BLOCKED') return 'Отклонен';
  if (state === 'NO_EMPLOYEE_PROFILE') return 'Без профиля';
  return 'На проверке';
}

export function profileStatusLabel(state: ProfileStatus) {
  if (state === 'ACTIVE') return 'Подтвержден';
  if (state === 'BLOCKED') return 'Отклонен';
  return 'На проверке';
}

export function profileTypeLabel(type?: ProfileType | null) {
  if (type === 'EMPLOYEE') return 'Сотрудник';
  if (type === 'CLIENT') return 'Клиент';
  if (type === 'SUPPLIER') return 'Поставщик';
  return 'Не выбран';
}

export function activeProfileTypeLabel(type?: ProfileType | null) {
  return `Основной профиль: ${profileTypeLabel(type)}`;
}

export function nameOf(item: AdminUsersListItem) {
  const text = [item.lastName, item.firstName, item.middleName].filter(Boolean).join(' ').trim();
  return text || item.email || `Пользователь #${item.id}`;
}

export function formatPhone(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  let num = digits;
  if (num.startsWith('8')) num = `7${num.slice(1)}`;
  if (!num.startsWith('7')) num = `7${num}`;
  return `+7 (${num.slice(1, 4)}) ${num.slice(4, 7)}-${num.slice(7, 9)}-${num.slice(9, 11)}`.trim();
}

export function needsModeration(item: AdminUsersListItem) {
  return item.moderationState === 'EMPLOYEE_PENDING';
}

export function formatLastSeen(iso?: string | null) {
  if (!iso) return 'Нет данных';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Нет данных';
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function moderationTone(state: AdminModerationState) {
  if (state === 'EMPLOYEE_ACTIVE') return { bg: '#DCFCE7', border: '#86EFAC', text: '#166534' };
  if (state === 'EMPLOYEE_BLOCKED') return { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B' };
  if (state === 'NO_EMPLOYEE_PROFILE') return { bg: '#F3F4F6', border: '#D1D5DB', text: '#4B5563' };
  return { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' };
}

export function onlineTone(isOnline?: boolean) {
  if (isOnline) return { bg: '#DCFCE7', border: '#86EFAC', text: '#166534', textValue: 'Онлайн' };
  return { bg: '#EEF2FF', border: '#C7D2FE', text: '#4338CA', textValue: 'Не в сети' };
}

export function channelLabel(item: AdminUsersListItem) {
  const push = item.channels?.push ? 'push ✓' : 'push ✕';
  const telegram = item.channels?.telegram ? 'tg ✓' : 'tg ✕';
  const max = item.channels?.max ? 'max ✓' : 'max ✕';
  return `${push} • ${telegram} • ${max}`;
}

export function initialsOf(item: AdminUsersListItem) {
  const first = String(item.firstName || '').trim();
  const last = String(item.lastName || '').trim();
  const source = `${first}${last}`.trim();
  if (!source) return 'U';
  return source
    .slice(0, 2)
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function shortTime(iso?: string | null) {
  if (!iso) return '--:--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
