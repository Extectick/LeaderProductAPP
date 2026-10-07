import { apiClient } from '../utils/apiClient';
import { getClientOrderDefaults, searchClientOrderDeliveryAddresses } from '../utils/clientOrdersService';
import { readActiveOfflineEntityItems } from '../src/features/clientOrders/offline/offlineOrdersDatabase';
import { setServerReachable, setServerUnavailable } from '../src/shared/network/serverStatus';

jest.mock('../utils/apiClient', () => ({ apiClient: jest.fn() }));
jest.mock('@/src/features/productCatalog', () => ({
  scheduleProductCatalogSync: jest.fn(), searchCatalogProducts: jest.fn(async () => null),
}));
jest.mock('@/src/features/clientOrders/offline/offlineOrdersDatabase', () => ({
  hasActiveOfflineEntity: jest.fn(async () => true), readActiveOfflineEntityItems: jest.fn(),
}));
const addresses = [
  { guid: 'partner:one', counterparty: { guid: 'c1' }, fullAddress: 'Омск, Мира 1', comment: 'С 10 до 18', kindName: 'Адрес доставки 1', isDefault: false },
  { guid: 'partner:two', counterparty: { guid: 'c1' }, fullAddress: 'Омск, Мира 2', comment: 'Вход со двора', isDefault: true },
  { guid: 'partner:one', counterparty: { guid: 'c2' }, fullAddress: 'Омск, Мира 1', isDefault: true },
];
beforeEach(() => {
  jest.clearAllMocks();
  setServerUnavailable('Network request failed');
  jest.mocked(readActiveOfflineEntityItems).mockImplementation(async entity => {
    if (entity === 'delivery-addresses') return addresses;
    if (entity === 'counterparties') return [{ guid: 'c1', name: 'Клиент' }];
    if (entity === 'organizations') return [{ guid: 'org', name: 'Организация' }];
    return [];
  });
});
afterEach(() => setServerReachable());

test('offline delivery picker filters by client, paginates and keeps delivery comments', async () => {
  const first = await searchClientOrderDeliveryAddresses({ counterpartyGuid: 'c1', organizationGuid: 'org', limit: 1 });
  expect(first.items).toEqual([{ ...addresses[0], counterpartyGuid: 'c1' }]);
  expect(first.meta).toMatchObject({ total: 2, hasMore: true });
  const second = await searchClientOrderDeliveryAddresses({ counterpartyGuid: 'c1', organizationGuid: 'org', limit: 1, offset: 1 });
  expect(second.items[0].guid).toBe('partner:two');
  expect(second.meta.hasMore).toBe(false);
  expect(apiClient).not.toHaveBeenCalled();
});

test('offline search and defaults select only this counterparty addresses', async () => {
  const found = await searchClientOrderDeliveryAddresses({ counterpartyGuid: 'c1', search: 'Мира 2' });
  expect(found.items).toHaveLength(1);
  const defaults = await getClientOrderDefaults({ counterpartyGuid: 'c1', organizationGuid: 'org' });
  expect(defaults.deliveryAddress).toMatchObject({ guid: 'partner:two', comment: 'Вход со двора' });
  expect(apiClient).not.toHaveBeenCalled();
});

test('empty data on the phone never prevents an online address request', async () => {
  setServerReachable();
  jest.mocked(readActiveOfflineEntityItems).mockResolvedValue([]);
  jest.mocked(apiClient).mockResolvedValue({ ok: true, status: 200, data: { items: [addresses[0]] },
    meta: { total: 1, limit: 25, offset: 0, hasMore: false } } as any);
  const found = await searchClientOrderDeliveryAddresses({ counterpartyGuid: 'c1' });
  expect(found.items).toHaveLength(1);
  expect(apiClient).toHaveBeenCalledTimes(1);
});
