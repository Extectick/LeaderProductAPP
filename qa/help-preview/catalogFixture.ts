/** Authorized local fixtures. Aliased only for ServicesCatalogScreen by this QA Metro project. */
import { SERVICE_CATALOG } from '../../src/features/services/config/serviceCatalog';

const visibleKeys = ['help', 'client_orders', 'stock_balances', 'transport_tasks', 'tracking', 'qrcodes', 'appeals'];
const services = SERVICE_CATALOG.filter(item => visibleKeys.includes(item.key)).map(item => ({ ...item, visible: true, enabled: true }));
const loadServices = async () => {};
export function useServicesData() { return { services, error: null, loading: false, loadServices }; }
export function useIsAdmin() { return { isAdmin: false, isCheckingAdmin: false }; }
export function useServerStatus() { return { isReachable: true, lastReason: null }; }
