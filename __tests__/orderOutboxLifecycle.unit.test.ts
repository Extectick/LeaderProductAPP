jest.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: { LeaderOrderOutbox: { setPending: jest.fn(async () => {}) } },
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => JSON.stringify({ id: 90 })) }));
jest.mock('../utils/tokenService', () => ({ getAccessTokenForRequest: jest.fn(), hasAuthSessionExpired: () => false }));
jest.mock('../utils/apiClient', () => ({ apiClient: jest.fn() }));
jest.mock('../src/shared/monitoring', () => ({ captureException: jest.fn() }));
jest.mock('../src/features/productCatalog/data/catalogDatabase', () => ({ getCatalogDatabase: async () => ({}) }));
jest.mock('../src/features/clientOrders/offline/orderOutboxScope', () => ({ initializeOrderApiScope: async () => {} }));
jest.mock('../src/features/clientOrders/offline/orderOutboxDatabase', () => ({
  hasPendingOrderUploads: jest.fn(), readAcceptedUploads: jest.fn(async () => []), claimOrderUploads: jest.fn(), acceptOrderUpload: jest.fn(),
  failOrderUpload: jest.fn(), updateSubmissionStatus: jest.fn(), completeOrderUpload: jest.fn(), expediteOrderUploads: jest.fn(async () => {}),
}));
import { AppState, NativeModules } from 'react-native';
import { apiClient } from '../utils/apiClient';
import { getAccessTokenForRequest } from '../utils/tokenService';
import * as storage from '../src/features/clientOrders/offline/orderOutboxDatabase';
import { startOrderOutbox, stopOrderOutbox, isAsyncOrderOutboxEnabled } from '../src/features/clientOrders/offline/orderOutbox';
import { setServerReachable, setServerUnavailable } from '../src/shared/network/serverStatus';
import { submissionHash } from '../src/features/clientOrders/offline/orderSubmissionProtocol';
let pending: boolean;
const packet = { apiScope: 'https://dev.test', userId: '90', clientOrderId: 'client-order-90', clientRevision: 1,
  payload: { intent: 'SUBMIT', clientRevision: 1 }, payloadHash: submissionHash({ intent: 'SUBMIT', clientRevision: 1 }), leaseToken: 'lease', attempts: 1, receipt: null };
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); setServerReachable(); pending = true;
  jest.mocked(getAccessTokenForRequest).mockResolvedValue(`e30.${Buffer.from(JSON.stringify({ userId: 90 })).toString('base64url')}.sig`);
  jest.mocked(storage.hasPendingOrderUploads).mockImplementation(async () => pending);
  jest.mocked(storage.claimOrderUploads).mockResolvedValueOnce([packet]).mockResolvedValue([]);
  jest.mocked(storage.acceptOrderUpload).mockImplementation(async () => { pending = false; });
  jest.mocked(apiClient).mockImplementation(async (path: string, options: any) => ({ ok: true, status: path.endsWith('/batch') ? 202 : 200,
    data: path.endsWith('/capabilities') ? { enabled: true, protocol: 'client-order-inbox-v1' } : { results: options.body.items.map((item: any) => ({
      ...item, userId: 90, clientRevision: 1, intent: 'SUBMIT', accepted: true, state: 'ACCEPTED', receiptVersion: 'client-order-inbox-v1',
      submissionId: 'receipt-90', acceptedAt: new Date().toISOString(),
    })) } } as any));
});
afterEach(() => { stopOrderOutbox(); jest.clearAllTimers(); jest.useRealTimers(); });
const flush = () => jest.advanceTimersByTimeAsync(1200);
const uploads = () => jest.mocked(apiClient).mock.calls.filter(([path]) => path.endsWith('/submissions/batch'));
it('automatically drains at authentication/startup without mounting an order screen', async () => {
  startOrderOutbox('90'); await flush();
  expect(uploads()).toHaveLength(1); expect(storage.acceptOrderUpload).toHaveBeenCalledTimes(1);
  expect(uploads()[0][1]).toEqual(expect.objectContaining({ expectedUserId: '90', networkRetryCount: 0 }));
  expect(isAsyncOrderOutboxEnabled()).toBe(true);
});
it('wakes and expedites a durable queued packet after reconnect', async () => {
  pending = false; startOrderOutbox('90'); await flush(); expect(uploads()).toHaveLength(0);
  pending = true; setServerUnavailable('offline'); setServerReachable(); await flush();
  expect(storage.expediteOrderUploads).toHaveBeenCalledWith('90'); expect(uploads()).toHaveLength(1);
});
it('wakes after app resume even when no service screen is mounted', async () => {
  pending = false; startOrderOutbox('90'); await flush(); pending = true;
  jest.mocked(AppState.addEventListener).mock.calls[0][1]('active'); await flush();
  expect(uploads()).toHaveLength(1);
});
it('keeps a native connectivity job pending on cold offline start with unknown capability', async () => {
  jest.mocked(apiClient).mockResolvedValue({ ok: false, status: 0, message: 'API не ответил' });
  startOrderOutbox('90'); await flush();
  expect(uploads()).toHaveLength(0); expect(storage.claimOrderUploads).not.toHaveBeenCalled();
  expect(NativeModules.LeaderOrderOutbox.setPending).toHaveBeenLastCalledWith(true);
});
it('does not automatically drain when the server explicitly disables the rollout', async () => {
  jest.mocked(apiClient).mockResolvedValue({ ok: true, status: 200, data: { enabled: false, protocol: 'client-order-inbox-v1' } } as any);
  startOrderOutbox('90'); await flush();
  expect(uploads()).toHaveLength(0); expect(storage.claimOrderUploads).not.toHaveBeenCalled();
  expect(isAsyncOrderOutboxEnabled()).toBe(false); expect(NativeModules.LeaderOrderOutbox.setPending).toHaveBeenLastCalledWith(false);
});
it('stops before transmission on logout', async () => {
  startOrderOutbox('90'); stopOrderOutbox(); await flush(); expect(apiClient).not.toHaveBeenCalled();
});
