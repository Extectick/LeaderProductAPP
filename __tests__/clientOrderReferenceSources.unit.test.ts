import { apiClient } from '../utils/apiClient';
import {
  searchClientOrderAgreements,
  searchClientOrderContracts,
  searchClientOrderCounterparties,
  searchClientOrderDeliveryAddresses,
  searchClientOrderPriceTypes,
  searchClientOrderWarehouses,
} from '../utils/clientOrdersService';
import { hasActiveOfflineEntity, readActiveOfflineEntityItems } from '../src/features/clientOrders/offline/offlineOrdersDatabase';
import { setServerReachable, setServerUnavailable } from '../src/shared/network/serverStatus';

jest.mock('../utils/apiClient', () => ({ apiClient: jest.fn() }));
jest.mock('@/src/features/productCatalog', () => ({ scheduleProductCatalogSync: jest.fn() }));
jest.mock('../src/features/clientOrders/offline/offlineOrdersDatabase', () => ({
  hasActiveOfflineEntity: jest.fn(),
  readActiveOfflineEntityItems: jest.fn(),
}));

const api = jest.mocked(apiClient);
const hasLocal = jest.mocked(hasActiveOfflineEntity);
const readLocal = jest.mocked(readActiveOfflineEntityItems);
const cached = { guid: 'cached', name: 'Локальный контрагент' };
const online = { guid: 'online', name: 'Контрагент из 1С', hasDebt: true, shipmentProhibited: true };
const selectors = [
  ['counterparties', searchClientOrderCounterparties],
  ['agreements', searchClientOrderAgreements],
  ['contracts', searchClientOrderContracts],
  ['warehouses', searchClientOrderWarehouses],
  ['price-types', searchClientOrderPriceTypes],
  ['delivery-addresses', searchClientOrderDeliveryAddresses],
] as const;

beforeEach(() => {
  jest.resetAllMocks();
  setServerReachable();
  hasLocal.mockResolvedValue(true);
  readLocal.mockResolvedValue([]);
  api.mockResolvedValue({ ok: true, status: 200, data: { items: [online] }, meta: { total: 1 } } as any);
});
afterEach(() => setServerReachable());

it.each(selectors)('%s loads online despite an initialized but empty offline dataset', async (entity, search) => {
  const result = await search({ search: 'клиент', limit: 25, offset: 0 });
  expect(result.items).toEqual([online]);
  expect(api).toHaveBeenCalledWith(expect.stringContaining(`/api/client-orders/${entity}?`), { timeoutMs: 65000 });
  expect(hasLocal).not.toHaveBeenCalled();
  expect(readLocal).not.toHaveBeenCalled();
});

it('does not wait for missing, broken or hanging SQLite when online', async () => {
  hasLocal.mockImplementation(() => new Promise(() => {}));
  readLocal.mockRejectedValue(new Error('SQLite unavailable'));
  await expect(searchClientOrderCounterparties()).resolves.toMatchObject({ items: [online] });
  expect(hasLocal).not.toHaveBeenCalled();
  expect(readLocal).not.toHaveBeenCalled();
});

it('uses current online records and honors all picker filters instead of old local records', async () => {
  readLocal.mockResolvedValue([cached]);
  const result = await searchClientOrderCounterparties({
    managerOnly: false, organizationGuid: 'org', debtStatus: 'with_debt', includeInactive: false,
    search: 'Контрагент', offset: 25, limit: 25,
  });
  expect(result.items).toEqual([online]);
  const query = new URL(api.mock.calls[0][0], 'https://example.test').searchParams;
  expect(Object.fromEntries(query)).toEqual({
    managerOnly: 'false', organizationGuid: 'org', debtStatus: 'with_debt', includeInactive: 'false',
    search: 'Контрагент', offset: '25', limit: '25',
  });
  expect(readLocal).not.toHaveBeenCalled();
});

it.each(selectors)('%s remains available immediately offline when cached', async (entity, search) => {
  setServerUnavailable('Network error');
  readLocal.mockResolvedValue([cached]);
  await expect(search({ limit: 10 })).resolves.toMatchObject({ items: [{ guid: 'cached' }], localOffline: true });
  expect(readLocal).toHaveBeenCalledWith(entity);
  expect(api).not.toHaveBeenCalled();
});

it.each([0, 408, 502, 503, 504])('falls back to cached records on transient status %s', async (status) => {
  readLocal.mockResolvedValue([cached]);
  api.mockResolvedValue({ ok: false, status, message: 'Соединение недоступно' } as any);
  await expect(searchClientOrderCounterparties()).resolves.toMatchObject({ items: [{ guid: 'cached' }], localOffline: true });
  expect(api).toHaveBeenCalledTimes(1);
});

it.each([400, 401, 403, 404, 409, 429, 499, 500])('does not mask API status %s with cached records', async (status) => {
  readLocal.mockResolvedValue([cached]);
  api.mockResolvedValue({ ok: false, status, message: 'Ошибка запроса' } as any);
  await expect(searchClientOrderCounterparties()).rejects.toMatchObject({ status });
  expect(readLocal).not.toHaveBeenCalled();
});

it('tries the API after a previous outage when the local snapshot is empty', async () => {
  setServerUnavailable('Network error');
  await expect(searchClientOrderCounterparties()).resolves.toMatchObject({ items: [online] });
  expect(api).toHaveBeenCalledTimes(1);
});

it('tries the API when offline data was never downloaded', async () => {
  setServerUnavailable('Network error');
  hasLocal.mockResolvedValue(false);
  await expect(searchClientOrderAgreements()).resolves.toMatchObject({ items: [online] });
  expect(api).toHaveBeenCalledTimes(1);
});

it('does not let a local database failure prevent reconnection', async () => {
  setServerUnavailable('Network error');
  hasLocal.mockRejectedValue(new Error('SQLite unavailable'));
  await expect(searchClientOrderContracts()).resolves.toMatchObject({ items: [online] });
});

it('reports the connection error instead of an empty success when neither source has data', async () => {
  api.mockResolvedValue({ ok: false, status: 0, errorCode: 'NETWORK_UNAVAILABLE' } as any);
  await expect(searchClientOrderCounterparties()).rejects.toMatchObject({ status: 0, errorCode: 'NETWORK_UNAVAILABLE' });
});

it('does not replace a valid empty online result with unrelated cached records', async () => {
  readLocal.mockResolvedValue([cached]);
  api.mockResolvedValue({ ok: true, status: 200, data: { items: [] }, meta: { total: 0 } } as any);
  await expect(searchClientOrderCounterparties({ managerOnly: true })).resolves.toMatchObject({ items: [], meta: { total: 0 } });
  expect(readLocal).not.toHaveBeenCalled();
});

it('filters and paginates offline records without bypassing the selected organization', async () => {
  setServerUnavailable('Network error');
  readLocal.mockResolvedValue([
    { guid: 'wrong', name: 'Договор', organization: { guid: 'other' }, counterparty: { guid: 'client' } },
    ...['first', 'second', 'third'].map((guid) => ({ guid, name: 'Договор', organization: { guid: 'org' }, counterparty: { guid: 'client' } })),
  ]);
  await expect(searchClientOrderContracts({ organizationGuid: 'org', counterpartyGuid: 'client', search: 'договор', limit: 1, offset: 1 }))
    .resolves.toMatchObject({ items: [{ guid: 'second', organizationGuid: 'org', counterpartyGuid: 'client' }], meta: { total: 3, count: 1, hasMore: true } });
  expect(api).not.toHaveBeenCalled();
});

it('preserves a genuine empty offline search result in a populated dataset', async () => {
  setServerUnavailable('Network error');
  readLocal.mockResolvedValue([cached]);
  await expect(searchClientOrderCounterparties({ search: 'Нет совпадений' })).resolves.toMatchObject({ items: [], localOffline: true });
  expect(api).not.toHaveBeenCalled();
});

it.each(['with_debt', 'without_debt'] as const)('does not fabricate the %s filter from an offline snapshot without debt data', async (debtStatus) => {
  readLocal.mockResolvedValue([cached]);
  api.mockResolvedValue({ ok: false, status: 0, errorCode: 'NETWORK_UNAVAILABLE' } as any);
  await expect(searchClientOrderCounterparties({ debtStatus })).rejects.toMatchObject({ status: 0 });
  expect(readLocal).not.toHaveBeenCalled();
});

it('keeps concurrent online selector requests deduplicated', async () => {
  let resolve!: (value: any) => void;
  api.mockReturnValue(new Promise((done) => { resolve = done; }));
  const first = searchClientOrderCounterparties();
  const second = searchClientOrderCounterparties();
  resolve({ ok: true, status: 200, data: { items: [online] } });
  expect(await Promise.all([first, second])).toHaveLength(2);
  expect(api).toHaveBeenCalledTimes(1);
});
