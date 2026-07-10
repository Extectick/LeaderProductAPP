import type { ServiceAccessItem } from '@/utils/servicesService';

export const ADMIN_CATALOG_SERVICE_KEY = 'admin';

export const ADMIN_CATALOG_SERVICE: ServiceAccessItem = {
  id: 9000,
  key: ADMIN_CATALOG_SERVICE_KEY,
  name: 'Админка',
  kind: 'LOCAL',
  route: '/admin',
  icon: 'shield-checkmark-outline',
  description: 'Управление пользователями, ролями, сервисами и обновлениями.',
  gradientStart: '#0F172A',
  gradientEnd: '#475569',
  visible: true,
  enabled: true,
};

export function applyAdminCatalogService(
  services: ServiceAccessItem[] | null | undefined,
  isAdmin: boolean
): ServiceAccessItem[] {
  const clean = (services || []).filter((item) => item.key !== ADMIN_CATALOG_SERVICE_KEY);
  if (!isAdmin) return clean;
  return [...clean, ADMIN_CATALOG_SERVICE].sort((a, b) => a.id - b.id || a.key.localeCompare(b.key));
}
