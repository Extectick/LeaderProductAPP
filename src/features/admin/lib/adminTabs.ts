import type { AdminTabItem } from '../types';

export const ADMIN_TABS: AdminTabItem[] = [
  { key: 'users', label: 'Пользователи', icon: 'account-group-outline' },
  { key: 'departments', label: 'Отделы', icon: 'domain' },
  { key: 'roles', label: 'Роли', icon: 'shield-account-outline' },
  { key: 'services', label: 'Сервисы', icon: 'apps' },
  { key: 'updates', label: 'Обновления', icon: 'cloud-upload-outline' },
];
