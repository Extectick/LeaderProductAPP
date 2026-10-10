import type { Profile } from '@/src/entities/user/types';
import { getRoleDisplayName } from '@/utils/rbacLabels';

export const profileSections = {
  personal: 'Личные данные', contacts: 'Контакты для клиентов', work: 'Работа и отделы',
  security: 'Безопасность', notifications: 'Уведомления', tracking: 'Геолокация', about: 'О приложении',
} as const;
export type ProfileSectionKey = keyof typeof profileSections;
export function isProfileSection(value: unknown): value is ProfileSectionKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(profileSections, value);
}
export function profileIdentity(profile: Profile) {
  return {
    name: [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ') || 'Профиль',
    initials: [profile.firstName?.[0], profile.lastName?.[0]].filter(Boolean).join('').toUpperCase(),
    subtitle: [getRoleDisplayName(profile.role), profile.employeeProfile?.department?.name].filter(Boolean).join(' · '),
  };
}
export function trackingSummary(enabled: boolean, status: string, recordedAt: string | number | null | undefined, now = Date.now()) {
  if (status === 'starting') return { text: 'Включаем геолокацию…', color: '#2563EB' };
  if (status === 'stopping') return { text: 'Приостанавливаем…', color: '#64748B' };
  if (status === 'needsTrackingAuth' || status === 'needsAuth') return { text: 'Нужно восстановить подключение', color: '#B45309' };
  if (status === 'permissionDenied') return { text: 'Нет разрешения на геопозицию', color: '#B45309' };
  if (status === 'serviceDenied' || status === 'error') return { text: 'Нужна проверка настроек', color: '#B45309' };
  if (!enabled) return { text: 'Приостановлена', color: '#64748B' };
  const timestamp = recordedAt ? new Date(recordedAt).getTime() : NaN;
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  const age = !Number.isFinite(minutes) ? 'ожидаем первую точку'
    : minutes < 1 ? 'точка только что' : minutes < 60 ? `точка ${minutes} мин назад`
    : minutes < 1440 ? `точка ${Math.floor(minutes / 60)} ч назад` : `точка ${Math.floor(minutes / 1440)} дн назад`;
  return { text: `Включена · ${age}`, color: status === 'waitingNetwork' || !Number.isFinite(minutes) || minutes > 5 ? '#B45309' : '#059669' };
}
