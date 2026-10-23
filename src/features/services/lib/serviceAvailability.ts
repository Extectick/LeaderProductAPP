import type { ServiceAccessItem } from '@/utils/servicesService';

// The API catalog may ship before an OTA. Server visibility does not mean that
// the current client contains the destination screen; never send users to 404.
export const INSTALLED_SERVICE_ROUTES: Readonly<Record<string, string>> = {
  help: '/services/help', qrcodes: '/services/qrcodes', appeals: '/services/appeals',
  tracking: '/services/tracking', stock_balances: '/services/stock_balances',
  client_orders: '/services/client_orders', transport_tasks: '/services/transport_tasks',
  tasks: '/tasks', admin: '/admin',
};

export function supportsServiceRoute(service: Pick<ServiceAccessItem, 'key' | 'route'>) {
  const expected = INSTALLED_SERVICE_ROUTES[service.key];
  if (!expected || !service.route) return false;
  const path = service.route.split(/[?#]/, 1)[0].replace(/^\/\(main\)(?=\/)/, '').replace(/\/$/, '');
  return path === expected;
}

/** Offline capability does not grant access: server-provided permissions still apply. */
export function canOpenService(service: ServiceAccessItem, online: boolean, platform: string) {
  if (!service.visible || !service.enabled || !service.route || !supportsServiceRoute(service)) return false;
  if (online || service.kind === 'LOCAL') return true;
  return platform !== 'web' && ['client_orders', 'stock_balances'].includes(service.key)
    && new RegExp(`^/(?:\\(main\\)/)?services/${service.key}/?$`).test(service.route);
}
