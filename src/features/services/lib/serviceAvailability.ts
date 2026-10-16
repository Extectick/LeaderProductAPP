import type { ServiceAccessItem } from '@/utils/servicesService';

/** Offline capability does not grant access: server-provided permissions still apply. */
export function canOpenService(service: ServiceAccessItem, online: boolean, platform: string) {
  if (!service.visible || !service.enabled || !service.route) return false;
  if (online || service.kind === 'LOCAL') return true;
  return platform !== 'web' && ['client_orders', 'stock_balances'].includes(service.key)
    && new RegExp(`^/(?:\\(main\\)/)?services/${service.key}/?$`).test(service.route);
}
