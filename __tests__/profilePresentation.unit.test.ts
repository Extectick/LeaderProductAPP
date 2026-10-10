import { isProfileSection, profileIdentity, trackingSummary } from '../src/features/profile/lib/presentation';

test('profile sections reject unknown routes and inherited object keys', () => {
  expect(isProfileSection('contacts')).toBe(true);
  expect(isProfileSection('password-reset')).toBe(false);
  expect(isProfileSection('toString')).toBe(false);
  expect(isProfileSection(['work'])).toBe(false);
});
test('identity uses actual employee department and handles missing names', () => {
  expect(profileIdentity({ firstName: 'Алексей', lastName: 'Иванов', role: { name: 'MANAGER', displayName: 'Менеджер' }, employeeProfile: { department: { name: 'Омск' } } } as any))
    .toEqual({ name: 'Алексей Иванов', initials: 'АИ', subtitle: 'Менеджер · Омск' });
  expect(profileIdentity({ role: { name: 'USER' } } as any).name).toBe('Профиль');
});
test('geo summary reports coordinate age, never invents fresh GPS', () => {
  const now = Date.parse('2026-10-11T10:00:00Z');
  expect(trackingSummary(true, 'tracking', '2026-10-11T09:58:00Z', now).text).toBe('Включена · точка 2 мин назад');
  expect(trackingSummary(true, 'tracking', undefined, now).text).toContain('ожидаем первую точку');
  expect(trackingSummary(true, 'tracking', 'invalid', now).color).toBe('#B45309');
  expect(trackingSummary(true, 'needsTrackingAuth', now, now).color).toBe('#B45309');
  expect(trackingSummary(false, 'idle', now, now).text).toBe('Приостановлена');
  expect(trackingSummary(true, 'permissionDenied', now, now).text).toContain('Нет разрешения');
});
