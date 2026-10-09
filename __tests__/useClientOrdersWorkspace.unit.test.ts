import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

jest.mock('@/context/AuthContext', () => {
  const React = require('react');
  return { AuthContext: React.createContext(null) };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  AppState: { currentState: 'active' },
  Platform: { OS: 'ios' },
}));

jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('@/utils/androidFileDownload', () => ({
  enqueueAuthenticatedAndroidDownload: jest.fn(),
}));

jest.mock('../src/features/clientOrders/offline/offlineOrdersDatabase', () => ({
  isOfflineDataReady: jest.fn(async () => false),
  readOfflineDatasetMeta: jest.fn(async () => null),
  readOfflineDataSyncTime: jest.fn(async () => null),
  readOfflineDrafts: jest.fn(async () => []),
  applyOfflineDraftChanges: jest.fn(async () => true),
}));

jest.mock('../src/features/clientOrders/offline/offlineOrdersSync', () => ({
  scheduleOfflineOrderDataSync: jest.fn(),
  isOfflineOrderDataSyncing: jest.fn(() => false),
  syncOfflineOrderData: jest.fn(async () => false),
}));

jest.mock('@/utils/orderGeo', () => ({
  captureOrderGeoEvent: jest.fn(async (type: 'CREATED' | 'SUBMITTED') => ({
    clientEventId: `test-${type.toLowerCase()}`,
    type,
    status: 'UNAVAILABLE',
    capturedAt: '2026-09-04T00:00:00.000Z',
    source: 'test',
    reason: 'TEST_ENVIRONMENT',
  })),
}));

jest.mock('@/utils/clientOrdersService', () => ({
  cancelClientOrder: jest.fn(),
  copyClientOrder: jest.fn(),
  createClientOrder: jest.fn(),
  deleteClientOrder: jest.fn(),
  getClientOrderDefaults: jest.fn(),
  getClientOrder: jest.fn(),
  getClientOrderInvoices: jest.fn(),
  getClientOrderInvoiceStatuses: jest.fn(),
  getClientOrderProductsBatch: jest.fn(),
  getClientOrderSettings: jest.fn(),
  getClientOrders: jest.fn(),
  getClientOrdersTodaySummary: jest.fn(),
  putClientOrderByClientId: jest.fn(),
  searchClientOrderAgreements: jest.fn(),
  searchClientOrderContracts: jest.fn(),
  searchClientOrderCounterparties: jest.fn(),
  searchClientOrderDeliveryAddresses: jest.fn(),
  searchClientOrderPriceTypes: jest.fn(),
  searchClientOrderProducts: jest.fn(),
  searchClientOrderWarehouses: jest.fn(),
  submitClientOrder: jest.fn(),
  restoreClientOrder: jest.fn(),
  unqueueClientOrder: jest.fn(),
  updateClientOrder: jest.fn(),
  updateClientOrderSettings: jest.fn(),
}));

import { AuthContext } from '@/context/AuthContext';
import { useClientOrdersWorkspace } from '../src/features/clientOrders/useClientOrdersWorkspace';
import { captureOrderGeoEvent } from '@/utils/orderGeo';
import { isOfflineDataReady, readOfflineDataSyncTime, readOfflineDatasetMeta, readOfflineDrafts, applyOfflineDraftChanges } from '../src/features/clientOrders/offline/offlineOrdersDatabase';
import { setServerReachable, setServerUnavailable } from '../src/shared/network/serverStatus';
import { syncOfflineOrderData } from '../src/features/clientOrders/offline/offlineOrdersSync';
import { buildLocalDraftPayload, emptyDraft } from '../src/features/clientOrders/clientOrdersShared';
import {
  createClientOrder,
  getClientOrder,
  getClientOrderInvoices,
  getClientOrderInvoiceStatuses,
  getClientOrderDefaults,
  getClientOrderProductsBatch,
  getClientOrderSettings,
  updateClientOrderSettings,
  getClientOrders,
  getClientOrdersTodaySummary,
  putClientOrderByClientId,
  submitClientOrder,
  updateClientOrder,
} from '@/utils/clientOrdersService';

const settings = {
  organizations: [{ guid: 'org-guid', name: 'Организация', isActive: true }],
  preferredOrganization: { guid: 'org-guid', name: 'Организация', isActive: true },
  deliveryDateMode: 'NEXT_DAY',
  deliveryDateOffsetDays: 1,
  fixedDeliveryDate: null,
  resolvedDeliveryDate: '2026-06-29T00:00:00.000Z',
  deliveryDateIssue: null,
  deliveryDateIssueMessage: null,
  currency: 'RUB',
};

function currentOmskDate() {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Omsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function queuedOrder(queuePosition: number, patch: Record<string, unknown> = {}) {
  return {
    guid: 'order-guid',
    source: 'MANAGER_APP',
    origin: 'local',
    revision: 1,
    status: 'QUEUED',
    syncState: 'QUEUED',
    queuePosition,
    createdAt: '2026-06-28T05:00:00.000Z',
    updatedAt: '2026-06-28T05:00:00.000Z',
    organization: { guid: 'org-guid', name: 'Организация' },
    counterparty: { guid: 'counterparty-guid', name: 'Контрагент' },
    items: [],
    events: [],
    ...patch,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useClientOrdersWorkspace', () => {
  async function editableWorkspace() {
    jest.mocked(getClientOrders).mockResolvedValue({ items: [], meta: { total: 0, limit: 20, offset: 0, statusCounts: {} } } as any);
    let current!: ReturnType<typeof useClientOrdersWorkspace>;
    const Harness = () => { current = useClientOrdersWorkspace(); return null; };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(AuthContext.Provider, {
        value: { isLoading: false, isAuthenticated: true, profile: { id: 1 },
          setAuthenticated: jest.fn(), setProfile: jest.fn(), signOut: jest.fn() } as any,
      }, React.createElement(Harness)));
    });
    await flush();
    await act(async () => {
      current.patchDraft({
        organizationGuid: 'org-guid', counterpartyGuid: 'counterparty-guid',
        deliveryDate: '2026-06-30T00:00:00.000Z', contentToken: 'initial-content-token',
        items: [{ key: 'line-key', lineGuid: 'line-guid', productGuid: 'product-guid', productName: 'Product',
          quantity: '2', packageGuid: null, manualPrice: '', discountPercent: '', comment: '',
          basePrice: 100, receiptPrice: null, baseUnit: { name: 'pcs', symbol: 'pcs' }, packages: [] }],
      });
    });
    await flush();
    return { get current() { return current; }, renderer };
  }

  it('does not retry an ordinary conflict with a freshly fetched revision', async () => {
    const harness = await editableWorkspace();
    jest.mocked(putClientOrderByClientId).mockRejectedValue(Object.assign(new Error('conflict'), {
      status: 409, errorDetails: { kind: 'ORDER_CONTENT_CONFLICT' },
    }));
    await act(async () => { await harness.current.saveDraft({ reason: 'manual' }); });
    expect(putClientOrderByClientId).toHaveBeenCalledTimes(1);
    expect(getClientOrder).not.toHaveBeenCalled();
    expect(harness.current.draft.items[0].quantity).toBe('2');
    await act(async () => harness.renderer.unmount());
  });

  it('keeps edits made while a save is pending and blocks a second simultaneous save', async () => {
    const harness = await editableWorkspace();
    let finish!: (value: any) => void;
    jest.mocked(putClientOrderByClientId).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    let pending!: ReturnType<typeof harness.current.saveDraft>;
    await act(async () => { pending = harness.current.saveDraft({ reason: 'manual' }); });
    await flush();
    expect(putClientOrderByClientId).toHaveBeenCalledTimes(1);
    await act(async () => {
      harness.current.patchDraft(prev => ({ ...prev, items: prev.items.map(item => ({ ...item, quantity: '5' })) }));
    });
    await act(async () => { await harness.current.saveDraft({ reason: 'manual' }); });
    expect(putClientOrderByClientId).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(queuedOrder(0, { status: 'DRAFT', syncState: 'DRAFT', clientRevision: 1,
        contentToken: 'saved-token', items: [{ lineGuid: 'line-guid', product: { guid: 'product-guid', name: 'Product' }, quantity: 2, basePrice: 100 }] }));
      expect(await pending).toBeNull();
    });
    expect(harness.current.draft.items[0].quantity).toBe('5');
    expect(harness.current.draft.contentToken).toBe('initial-content-token');
    await act(async () => harness.renderer.unmount());
  });

  it('retries a reduction only after confirmation with the exact same client revision', async () => {
    const harness = await editableWorkspace();
    const challenge = Object.assign(new Error('review'), { status: 409,
      errorDetails: { kind: 'ORDER_CHANGE_REVIEW_REQUIRED', baseContentToken: 'confirmed-base',
        confirmationToken: 'signed-challenge', changes: [{ productName: 'Product', reason: 'Удаление строки', before: 2, after: null }] } });
    jest.mocked(putClientOrderByClientId).mockRejectedValueOnce(challenge)
      .mockResolvedValueOnce(queuedOrder(0, { status: 'DRAFT', syncState: 'DRAFT', items: [] }) as any);
    jest.requireMock('react-native').Alert.alert.mockImplementation((_title: string, _message: string, buttons: any[]) => {
      buttons.find(button => button.text === 'Подтвердить').onPress();
    });
    await act(async () => { await harness.current.saveDraft({ reason: 'manual' }); });
    expect(putClientOrderByClientId).toHaveBeenCalledTimes(2);
    const calls = jest.mocked(putClientOrderByClientId).mock.calls;
    expect(calls[1][0]).toBe(calls[0][0]);
    expect(calls[1][2].clientRevision).toBe(calls[0][2].clientRevision);
    expect(calls[1][1].integrity).toEqual({ baseContentToken: 'confirmed-base', confirmationToken: 'signed-challenge' });
    await act(async () => harness.renderer.unmount());
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    setServerReachable();
    jest.mocked(readOfflineDrafts).mockResolvedValue([]);
    jest.mocked(applyOfflineDraftChanges).mockResolvedValue(true);
    jest.mocked(captureOrderGeoEvent).mockImplementation(async (type) => ({
      clientEventId: `test-${type.toLowerCase()}`,
      type,
      status: 'UNAVAILABLE',
      capturedAt: '2026-09-04T00:00:00.000Z',
      source: 'test',
      reason: 'TEST_ENVIRONMENT',
    }));
    jest.mocked(getClientOrderSettings).mockResolvedValue(settings as any);
    jest.mocked(getClientOrderInvoices).mockResolvedValue([]);
    jest.mocked(getClientOrderInvoiceStatuses).mockResolvedValue([]);
    jest.mocked(getClientOrdersTodaySummary).mockResolvedValue({
      date: currentOmskDate(),
      ordersCount: 0,
      clientsCount: 0,
      totalAmount: 0,
      profit: 0,
      profitAvailable: true,
      missingReceiptPriceCount: 0,
      currency: 'RUB',
      calculatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function ordersListWorkspace(userId = 1) {
    let current!: ReturnType<typeof useClientOrdersWorkspace>;
    const Harness = () => { current = useClientOrdersWorkspace({ screenMode: 'orders' }); return null; };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(AuthContext.Provider, {
        value: { isLoading: false, isAuthenticated: true, profile: { id: userId },
          setAuthenticated: jest.fn(), setProfile: jest.fn(), signOut: jest.fn() } as any,
      }, React.createElement(Harness)));
    });
    await flush();
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    return { get current() { return current; }, renderer };
  }

  it('keeps cached documents and quiet offline feedback on repeated refresh and pagination, then recovers automatically', async () => {
    const saved = queuedOrder(0, { status: 'CONFIRMED', syncState: 'SYNCED', number1c: 'НОУТ-000001' });
    const page = { items: [saved], meta: { total: 40, limit: 20, offset: 0, hasMore: true, liveSource: { status: 'ok' } } };
    jest.mocked(getClientOrders).mockResolvedValue(page as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.refreshOrders(); });
      expect(harness.current.orders.map(order => order.guid)).toEqual([saved.guid]);
      await act(async () => { setServerUnavailable('Network request failed'); });
      jest.mocked(getClientOrders).mockRejectedValue(new Error('Нет связи с 1С. Проверьте интернет-соединение.'));
      for (let attempt = 0; attempt < 3; attempt++) {
        await act(async () => { await harness.current.refreshOrders(); });
        expect(harness.current.ordersError).toBeNull();
        expect(harness.current.ordersConnectionNotice).toBe('Офлайн · обновление после подключения');
        expect(harness.current.orders.map(order => order.guid)).toEqual([saved.guid]);
      }
      await act(async () => { await harness.current.loadMoreOrders(); });
      expect(harness.current.ordersAppendError).toBeNull();

      // Suppressing the banner must not suppress the existing recovery loop.
      jest.mocked(getClientOrders).mockImplementation(async () => {
        setServerReachable();
        return { ...page, items: [{ ...saved, number1c: 'НОУТ-000002' }] } as any;
      });
      const previousCalls = jest.mocked(getClientOrders).mock.calls.length;
      await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
      await flush();
      expect(jest.mocked(getClientOrders).mock.calls.length).toBeGreaterThan(previousCalls);
      expect(harness.current.orders[0].number1c).toBe('НОУТ-000002');
      expect(harness.current.ordersConnectionNotice).toBeNull();
      expect(harness.current.ordersError).toBeNull();
      expect(submitClientOrder).not.toHaveBeenCalled();
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
    } finally {
      await act(async () => harness.renderer.unmount());
    }
  });

  it('hides offline liveSource warnings but keeps 1C failures visible when API is reachable', async () => {
    const page = { items: [queuedOrder(0, { status: 'CONFIRMED', syncState: 'SYNCED' })],
      meta: { total: 1, limit: 20, offset: 0, liveSource: { status: 'unavailable', message: 'Нет связи с 1С' } } };
    setServerUnavailable('Network request failed');
    jest.mocked(getClientOrders).mockResolvedValue(page as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.refreshOrders(); });
      expect(harness.current.ordersError).toBeNull();
      expect(harness.current.ordersConnectionNotice).not.toBeNull();
      expect(getClientOrderSettings).not.toHaveBeenCalled();
      await act(async () => { setServerReachable(); });
      await act(async () => { await harness.current.refreshOrders(); });
      expect(harness.current.ordersError).toContain('Нет связи с 1С');
      expect(harness.current.ordersConnectionNotice).toBeNull();
    } finally {
      await act(async () => harness.renderer.unmount());
    }
  });

  it('does not hide non-network list errors in offline mode', async () => {
    setServerUnavailable('Network request failed');
    jest.mocked(getClientOrders).mockRejectedValue(Object.assign(new Error('Нет прав на просмотр документов'), { status: 403 }));
    const harness = await ordersListWorkspace();
    try {
      // Foreground refresh is local-only now. A background probe may still
      // discover a permission failure and must not disguise it as offline.
      await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
      expect(harness.current.ordersError).toBe('Нет прав на просмотр документов');
      expect(harness.current.ordersConnectionNotice).not.toBeNull();
    } finally {
      await act(async () => harness.renderer.unmount());
    }
  });

  it('does not hide the failure of an explicit send action while offline', async () => {
    setServerUnavailable('Network request failed');
    jest.mocked(getClientOrders).mockRejectedValue(new Error('Network request failed'));
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.refreshOrders(); });
      expect(harness.current.ordersError).toBeNull();
      jest.mocked(submitClientOrder).mockRejectedValue(new Error('Network request failed'));
      await act(async () => { await harness.current.submitOrderFromList(queuedOrder(0, { status: 'DRAFT', syncState: 'DRAFT' }) as any); });
      expect(harness.current.ordersError).toContain('Нет связи с 1С');
    } finally {
      await act(async () => harness.renderer.unmount());
    }
  });

  it('finishes an initial offline list load without a recurring error even when no cache exists', async () => {
    setServerUnavailable('Network request failed');
    jest.mocked(getClientOrders).mockRejectedValue(new Error('Network request failed'));
    jest.mocked(getClientOrderSettings).mockRejectedValue(new Error('Network request failed'));
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.refreshOrders(); });
      expect(harness.current.orders).toEqual([]);
      expect(harness.current.ordersError).toBeNull();
      expect(harness.current.loadingOrders).toBe(false);
      expect(harness.current.ordersConnectionNotice).not.toBeNull();
    } finally {
      await act(async () => harness.renderer.unmount());
    }
  });

  function memoryDraftStore(initial: any[] = []) {
    const records = new Map(initial.map(entry => [entry.clientOrderId, entry]));
    jest.mocked(readOfflineDrafts).mockImplementation(async () => [...records.values()]);
    jest.mocked(applyOfflineDraftChanges).mockImplementation(async (_userId, upserts, removals = []) => {
      for (const entry of upserts) records.set(entry.clientOrderId, JSON.parse(JSON.stringify(entry)));
      for (const entry of removals) if (records.get(entry.clientOrderId)?.clientRevision === entry.clientRevision) records.delete(entry.clientOrderId);
      return true;
    });
    return records;
  }

  it('hydrates settings before the cold-start network request and retains them if it fails', async () => {
    const { writeLocalOrderSettings } = require('../src/features/clientOrders/offline/localOrderSettings');
    const store = new Map<string, string>();
    jest.mocked(AsyncStorage.getItem).mockImplementation(async key => store.get(key) ?? null);
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { store.set(key, value); });
    await writeLocalOrderSettings('1', settings);
    let reject!: (error: Error) => void;
    jest.mocked(getClientOrderSettings).mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const harness = await ordersListWorkspace();
    try {
      expect(harness.current.settings?.organizations).toEqual(settings.organizations);
      expect(harness.current.loadingSettings).toBe(false);
      await act(async () => { setServerUnavailable('Network request failed'); reject(new Error('Network request failed')); });
      expect(harness.current.settings?.organizations).toEqual(settings.organizations);
      expect(harness.current.ordersError).toBeNull();
      expect(harness.current.error).toBeNull();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  function localEntry(id: string, status = 'ON_DEVICE', incomplete = false) {
    const value = { ...emptyDraft(), organizationGuid: 'org-guid', counterpartyGuid: 'counterparty-guid',
      agreementGuid: 'agreement-guid', contractGuid: 'contract-guid', warehouseGuid: 'warehouse-guid',
      deliveryAddressGuid: 'address-guid', deliveryDate: '2026-09-25T00:00:00Z', clientOrderId: id, clientRevision: 1,
      items: incomplete ? [] : [{ key: 'line', lineGuid: 'line', productGuid: 'product-guid', productName: 'Товар',
        quantity: '2', packageGuid: null, manualPrice: '', discountPercent: '', comment: '', basePrice: 100,
        receiptPrice: null, packages: [], packagesLoaded: true }] } as any;
    return { id, clientOrderId: id, clientRevision: 1, status, intent: status === 'ON_DEVICE' ? 'SAVE' : 'SUBMIT',
      serverGuid: null, serverRevision: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      order: { ...queuedOrder(0), guid: `device-order-${id}`, clientOrderId: id, clientRevision: 1,
        origin: 'device', status: 'DRAFT', syncState: 'DRAFT', localDraft: value }, payload: buildLocalDraftPayload(value) };
  }

  it('remembers organization offline across remounts without sharing it with another user', async () => {
    const store = new Map<string, string>();
    jest.mocked(AsyncStorage.getItem).mockImplementation(async key => store.get(key) ?? null);
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { store.set(key, value); });
    const second = { guid: 'org-2', name: 'Вторая организация', isActive: true };
    jest.mocked(getClientOrderSettings).mockResolvedValue({ ...settings, organizations: [...settings.organizations, second] } as any);
    jest.mocked(getClientOrders).mockResolvedValue({ items: [], meta: { total: 0, limit: 20, offset: 0 } } as any);
    const first = await ordersListWorkspace();
    const alreadyMountedList = await ordersListWorkspace();
    await act(async () => { setServerUnavailable('Network request failed'); });
    await act(async () => { await first.current.setOrganization(second); });
    await flush();
    await act(async () => { await alreadyMountedList.current.createDocument(); });
    expect(alreadyMountedList.current.draft.organizationGuid).toBe('org-2');
    await act(async () => alreadyMountedList.renderer.unmount());
    await act(async () => first.renderer.unmount());
    const secondMount = await ordersListWorkspace();
    expect(secondMount.current.draft.organizationGuid).toBe('org-2');
    expect(secondMount.current.selections.organization?.name).toBe(second.name);
    expect(updateClientOrderSettings).not.toHaveBeenCalled();
    expect(secondMount.current.error).toBeNull();
    await act(async () => secondMount.renderer.unmount());
    const otherUser = await ordersListWorkspace(2);
    expect(otherUser.current.draft.organizationGuid).toBe('');
    await act(async () => otherUser.renderer.unmount());
  });

  it('silently autosaves incomplete local input once per edit and restores it exactly after remount', async () => {
    const records = memoryDraftStore();
    setServerUnavailable('Network request failed');
    const harness = await ordersListWorkspace();
    await act(async () => { harness.current.patchDraft({ organizationGuid: 'org-guid', counterpartyGuid: '', comment: 'Незавершённый' }); });
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    expect(harness.current.error).toBeNull();
    expect(harness.current.saving).toBe(false);
    expect(records.size).toBe(1);
    const firstWrites = jest.mocked(applyOfflineDraftChanges).mock.calls.length;
    await act(async () => { await jest.advanceTimersByTimeAsync(1_500); });
    expect(applyOfflineDraftChanges).toHaveBeenCalledTimes(firstWrites);
    await act(async () => { harness.current.patchDraft({ items: localEntry('x').order.localDraft.items.map((line: any) => ({ ...line, quantity: '1,' })) }); });
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    expect(harness.current.error).toBeNull();
    expect(harness.current.draft.items[0].quantity).toBe('1,');
    expect(getClientOrderProductsBatch).not.toHaveBeenCalled();
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    const saved = [...records.values()][0];
    await act(async () => harness.renderer.unmount());
    const restored = await ordersListWorkspace();
    await act(async () => { await restored.current.selectOrder(saved.order.guid); });
    expect(restored.current.draft.counterpartyGuid).toBe('');
    expect(restored.current.draft.comment).toBe('Незавершённый');
    expect(restored.current.draft.items[0].quantity).toBe('1,');
    await act(async () => restored.renderer.unmount());
  });

  it('queues a local order once, never sends on reconnect, and drains only on explicit bulk action', async () => {
    const records = memoryDraftStore();
    setServerUnavailable('Network request failed');
    const harness = await ordersListWorkspace();
    await act(async () => { harness.current.patchDraft(localEntry('local-queue').order.localDraft); });
    await act(async () => { await Promise.all([harness.current.submitOrder(), harness.current.submitOrder()]); });
    expect(records.size).toBe(1);
    const queued = [...records.values()][0];
    expect(queued.status).toBe('READY_TO_SEND');
    expect(queued.intent).toBe('SUBMIT');
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    await act(async () => { setServerReachable(); });
    await flush();
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    jest.mocked(putClientOrderByClientId).mockResolvedValue(queuedOrder(1, { guid: 'api-queued', clientOrderId: queued.clientOrderId }) as any);
    await act(async () => { await Promise.all([harness.current.syncDeviceDrafts({ force: true }), harness.current.syncDeviceDrafts({ force: true })]); });
    expect(putClientOrderByClientId).toHaveBeenCalledTimes(1);
    expect(jest.mocked(putClientOrderByClientId).mock.calls[0][2].intent).toBe('SUBMIT');
    expect(records.size).toBe(0);
    expect(harness.current.orders.map(order => order.guid)).toEqual(['api-queued']);
    expect(harness.current.orders[0].syncState).toBe('QUEUED');
    await act(async () => harness.renderer.unmount());
  });

  it('bulk sends only explicitly queued documents sequentially, leaving ordinary drafts untouched', async () => {
    const completeDraft = localEntry('complete');
    const incompleteDraft = localEntry('incomplete', 'ON_DEVICE', true);
    const records = memoryDraftStore([completeDraft, localEntry('first', 'READY_TO_SEND'),
      localEntry('second', 'SEND_ERROR'), incompleteDraft, localEntry('review', 'PRICE_REVIEW'),
      localEntry('invalid-queued', 'READY_TO_SEND', true)]);
    jest.mocked(getClientOrders).mockResolvedValue({ items: [], meta: { total: 0, limit: 20, offset: 0 } } as any);
    let inFlight = 0;
    let maxInFlight = 0;
    jest.mocked(putClientOrderByClientId).mockImplementation(async id => {
      inFlight++; maxInFlight = Math.max(inFlight, maxInFlight);
      await Promise.resolve(); inFlight--;
      return queuedOrder(1, { guid: `api-${id}`, clientOrderId: id }) as any;
    });
    const harness = await ordersListWorkspace();
    expect(harness.current.deviceDraftsCount).toBe(6);
    expect(harness.current.readyDeviceDraftsCount).toBe(3);
    expect(harness.current.queuedDeviceDraftsCount).toBe(3);
    await act(async () => { await harness.current.syncDeviceDrafts({ force: true }); });
    expect(maxInFlight).toBe(1);
    expect(jest.mocked(putClientOrderByClientId).mock.calls.map(call => call[0])).toEqual(['first', 'second']);
    expect(records.get('complete')).toEqual(completeDraft);
    expect(records.get('incomplete')).toEqual(incompleteDraft);
    expect(records.get('invalid-queued').status).toBe('NEEDS_EDIT');
    expect(records.get('review').status).toBe('PRICE_REVIEW');
    expect(records.size).toBe(4);
    expect(harness.current.queuedDeviceDraftsCount).toBe(0);
    expect(harness.current.syncingDeviceDrafts).toBe(false);
    await act(async () => harness.renderer.unmount());
  });

  it.each(['ON_DEVICE', 'READY_TO_SEND', 'SEND_ERROR', 'PRICE_REVIEW', 'SENDING'])
  ('never promotes a SAVE draft to submission even with a %s status or forced price policy', async status => {
    const entry = { ...localEntry('ordinary-draft', status), intent: 'SAVE' };
    const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    try {
      const before = JSON.stringify([...records.values()]);
      expect(harness.current.queuedDeviceDraftsCount).toBe(0);
      expect(harness.current.readyDeviceDraftsCount).toBe(0);
      await act(async () => { await harness.current.syncDeviceDrafts({ force: true }); });
      await act(async () => { await harness.current.syncDeviceDrafts({ force: true,
        orderGuid: entry.order.guid, pricePolicy: 'KEEP_DRAFT' }); });
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      expect(createClientOrder).not.toHaveBeenCalled();
      expect(updateClientOrder).not.toHaveBeenCalled();
      expect(submitClientOrder).not.toHaveBeenCalled();
      expect(JSON.stringify([...records.values()])).toBe(before);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('keeps price-review documents out of bulk sending until a price choice targets that document', async () => {
    const review = localEntry('review', 'PRICE_REVIEW');
    const records = memoryDraftStore([review, localEntry('other-review', 'PRICE_REVIEW')]);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.syncDeviceDrafts({ force: true, pricePolicy: 'USE_CURRENT' }); });
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      expect(harness.current.queuedDeviceDraftsCount).toBe(0);
      jest.mocked(putClientOrderByClientId).mockResolvedValue(queuedOrder(1, { clientOrderId: review.clientOrderId }) as any);
      await act(async () => { await harness.current.syncDeviceDrafts({ force: true,
        orderGuid: review.order.guid, pricePolicy: 'USE_CURRENT' }); });
      expect(putClientOrderByClientId).toHaveBeenCalledTimes(1);
      expect(putClientOrderByClientId).toHaveBeenCalledWith('review', expect.anything(),
        expect.objectContaining({ intent: 'SUBMIT', offlineReview: { pricePolicy: 'USE_CURRENT' } }));
      expect([...records.keys()]).toEqual(['other-review']);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('keeps a sending document in the queue badge until the request finishes', async () => {
    memoryDraftStore([localEntry('queued', 'READY_TO_SEND'), localEntry('ordinary')]);
    let finish!: (order: any) => void;
    jest.mocked(putClientOrderByClientId).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const harness = await ordersListWorkspace();
    try {
      let sending!: Promise<void>;
      await act(async () => { sending = harness.current.syncDeviceDrafts({ force: true }); });
      expect(harness.current.syncingDeviceDrafts).toBe(true);
      expect(harness.current.readyDeviceDraftsCount).toBe(0);
      expect(harness.current.queuedDeviceDraftsCount).toBe(1);
      await act(async () => { finish(queuedOrder(1, { clientOrderId: 'queued' })); await sending; });
      expect(harness.current.queuedDeviceDraftsCount).toBe(0);
      expect(harness.current.deviceDraftsCount).toBe(1);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('replaces a locally copied draft with the server document instead of leaving its old row', async () => {
    memoryDraftStore();
    setServerUnavailable('test');
    const harness = await ordersListWorkspace();
    try {
      const source = localEntry('source').order.localDraft;
      await act(async () => { harness.current.patchDraft({ ...source,
        items: source.items.map((item: any) => ({ ...item, manualPrice: '100' })),
      }); });
      await act(async () => { await harness.current.copyOrder(); });
      const clientOrderId = harness.current.draft.clientOrderId;
      expect(harness.current.orders).toHaveLength(1);
      jest.mocked(putClientOrderByClientId).mockResolvedValue(queuedOrder(0, {
        guid: 'api-copy', clientOrderId, syncState: 'SYNCED', status: 'CONFIRMED', number1c: 'НОУТ-109709',
      }) as any);
      await act(async () => { setServerReachable(); });
      // A copy is a new draft, not an implicit permission to submit it.
      await act(async () => { await harness.current.submitOrder(); });
      expect(harness.current.queuedDeviceDraftsCount).toBe(1);
      await act(async () => { await harness.current.syncDeviceDrafts({ force: true }); });
      expect(harness.current.deviceDraftsCount).toBe(0);
      expect(harness.current.orders.map(order => order.guid)).toEqual(['api-copy']);
      expect(harness.current.orders[0].number1c).toBe('НОУТ-109709');
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it.each(['missing', 'unchanged'])('reconciles a submitted order when the first list page is %s', async (kind) => {
    const pending = queuedOrder(1, { clientOrderId: 'local-id', appGuid: 'order-guid' });
    const other = queuedOrder(0, { guid: 'older-order', syncState: 'SYNCED', status: 'CONFIRMED', number1c: 'НОУТ-100001' });
    const page = (items: any[]) => ({ items, meta: { total: 10, limit: 20, offset: 0, liveSource: { status: 'ok' } } });
    jest.mocked(getClientOrders).mockResolvedValue(page([pending, other]) as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.refreshOrders(); });
      jest.mocked(getClientOrders).mockResolvedValue(page(kind === 'missing' ? [other] : [pending, other]) as any);
      jest.mocked(getClientOrder).mockResolvedValue({ ...pending, number1c: 'НОУТ-109710', status: 'CONFIRMED', syncState: 'SYNCED', queuePosition: null } as any);
      await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
      expect(getClientOrder).toHaveBeenCalledWith('order-guid');
      expect(harness.current.orders.find(order => order.guid === 'order-guid')).toMatchObject({ number1c: 'НОУТ-109710', status: 'CONFIRMED', syncState: 'SYNCED' });
      const writes = jest.mocked(AsyncStorage.setItem).mock.calls.filter(([key]) => key === 'client_orders_list_cache_v1:1');
      expect(JSON.parse(writes[writes.length - 1][1]).orders.find((order: any) => order.guid === 'order-guid'))
        .toMatchObject({ number1c: 'НОУТ-109710', syncState: 'SYNCED' });
      // A delayed cached page cannot turn the confirmed order back into a queue row.
      await act(async () => { await harness.current.refreshOrders(); });
      if (kind === 'unchanged') expect(harness.current.orders.find(order => order.guid === 'order-guid')?.syncState).toBe('SYNCED');
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('retains a pending row after a failed direct read and retries without sending again', async () => {
    const pending = queuedOrder(1);
    const page = (items: any[]) => ({ items, meta: { total: items.length, limit: 20, offset: 0 } });
    jest.mocked(getClientOrders).mockResolvedValue(page([pending]) as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await jest.advanceTimersByTimeAsync(120); });
      jest.mocked(getClientOrders).mockResolvedValue(page([]) as any);
      jest.mocked(getClientOrder).mockRejectedValueOnce(new Error('temporary timeout'))
        .mockResolvedValue({ ...pending, number1c: 'НОУТ-109710', status: 'CONFIRMED', syncState: 'SYNCED' } as any);
      await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
      expect(harness.current.orders[0].syncState).toBe('QUEUED');
      expect(harness.current.ordersError).toBeNull();
      await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
      expect(harness.current.orders[0].number1c).toBe('НОУТ-109710');
      expect(getClientOrder).toHaveBeenCalledTimes(2);
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('bounds direct status reads, rotates the queue and does not poll in the background or offline', async () => {
    const pending = Array.from({ length: 7 }, (_, index) => queuedOrder(index + 1, { guid: `pending-${index}` }));
    jest.mocked(getClientOrders).mockResolvedValue({ items: pending, meta: { total: 7, limit: 20, offset: 0 } } as any);
    let inFlight = 0;
    let maxInFlight = 0;
    jest.mocked(getClientOrder).mockImplementation(async guid => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve(); inFlight--;
      return pending.find(order => order.guid === guid) as any;
    });
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await jest.advanceTimersByTimeAsync(120); });
      await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
      expect(getClientOrder).toHaveBeenCalledTimes(3);
      expect(maxInFlight).toBe(1);
      await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
      expect(getClientOrder).toHaveBeenCalledTimes(6);
      expect(new Set(jest.mocked(getClientOrder).mock.calls.map(([guid]) => guid)).size).toBe(6);
      AppState.currentState = 'background';
      await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
      expect(getClientOrder).toHaveBeenCalledTimes(6);
      AppState.currentState = 'active';
      await act(async () => { setServerUnavailable('test'); });
      await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
      expect(getClientOrder).toHaveBeenCalledTimes(6);
      expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { AppState.currentState = 'active'; await act(async () => harness.renderer.unmount()); }
  });

  it('does not roll back a successful bulk send when an older list request finishes afterwards', async () => {
    memoryDraftStore([localEntry('queued-locally', 'READY_TO_SEND')]);
    jest.mocked(getClientOrders).mockResolvedValue({ items: [], meta: { total: 0, limit: 20, offset: 0 } } as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await jest.advanceTimersByTimeAsync(120); });
      let finish!: (value: any) => void;
      jest.mocked(getClientOrders).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      let refresh!: ReturnType<typeof harness.current.refreshOrders>;
      await act(async () => { refresh = harness.current.refreshOrders(); });
      jest.mocked(putClientOrderByClientId).mockResolvedValue(queuedOrder(0, {
        clientOrderId: 'queued-locally', number1c: 'НОУТ-109710', status: 'CONFIRMED', syncState: 'SYNCED',
      }) as any);
      await act(async () => { await harness.current.syncDeviceDrafts({ force: true }); });
      await act(async () => { finish({ items: [], meta: { total: 0, limit: 20, offset: 0 } }); await refresh; });
      expect(harness.current.orders).toHaveLength(1);
      expect(harness.current.orders[0]).toMatchObject({ guid: 'order-guid', number1c: 'НОУТ-109710', syncState: 'SYNCED' });
      expect(harness.current.loadingOrders).toBe(false);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('merges server identity aliases on pagination without duplicating the submitted document', async () => {
    const pending = queuedOrder(1, { clientOrderId: 'local-id' });
    jest.mocked(getClientOrders).mockResolvedValue({ items: [pending], meta: { total: 2, limit: 1, offset: 0, hasMore: true } } as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await jest.advanceTimersByTimeAsync(120); });
      jest.mocked(getClientOrders).mockResolvedValue({ items: [{ ...pending, guid: 'onec-guid', appGuid: pending.guid,
        number1c: 'НОУТ-109710', status: 'CONFIRMED', syncState: 'SYNCED' }], meta: { total: 2, limit: 1, offset: 1 } } as any);
      await act(async () => { await harness.current.loadMoreOrders(); });
      expect(harness.current.orders).toHaveLength(1);
      expect(harness.current.orders[0]).toMatchObject({ guid: 'onec-guid', number1c: 'НОУТ-109710' });
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('removes device ghost rows only from the list cache, preserving actual SQLite drafts', async () => {
    const draft = localEntry('unsent');
    const records = memoryDraftStore([draft]);
    const confirmed = queuedOrder(0, { status: 'CONFIRMED', syncState: 'SYNCED', number1c: 'НОУТ-109710' });
    jest.mocked(getClientOrders).mockResolvedValue({ items: [confirmed], meta: { total: 1, limit: 20, offset: 0 } } as any);
    const harness = await ordersListWorkspace();
    await act(async () => { await harness.current.refreshOrders(); });
    const writes = jest.mocked(AsyncStorage.setItem).mock.calls.filter(([key]) => key === 'client_orders_list_cache_v1:1');
    const cache = JSON.parse(writes[writes.length - 1][1]);
    cache.orders.push(localEntry('already-sent-ghost').order, draft.order);
    await act(async () => harness.renderer.unmount());
    jest.mocked(AsyncStorage.getItem).mockImplementation(async key => key === 'client_orders_list_cache_v1:1' ? JSON.stringify(cache) : null);
    setServerUnavailable('test');
    const restored = await ordersListWorkspace();
    try {
      expect(restored.current.orders.map(order => order.guid)).toEqual([draft.order.guid, confirmed.guid]);
      expect(restored.current.deviceDraftsCount).toBe(1);
      expect(records.has('unsent')).toBe(true);
    } finally { await act(async () => restored.renderer.unmount()); }
  });

  it('accepts a newer intentional requeue instead of freezing a confirmed status forever', async () => {
    const confirmed = queuedOrder(0, { status: 'CONFIRMED', syncState: 'SYNCED', number1c: 'НОУТ-109710' });
    const page = (order: any) => ({ items: [order], meta: { total: 1, limit: 20, offset: 0 } });
    jest.mocked(getClientOrders).mockResolvedValue(page(confirmed) as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.refreshOrders(); });
      jest.mocked(getClientOrders).mockResolvedValue(page({ ...confirmed, status: 'QUEUED', syncState: 'QUEUED',
        revision: 2, updatedAt: '2026-06-28T06:00:00.000Z' }) as any);
      await act(async () => { await harness.current.refreshOrders(); });
      expect(harness.current.orders[0]).toMatchObject({ syncState: 'QUEUED', revision: 2 });
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('does not start concurrent direct status reads when a previous poll is still pending', async () => {
    const pending = queuedOrder(1);
    jest.mocked(getClientOrders).mockResolvedValue({ items: [pending], meta: { total: 1, limit: 20, offset: 0 } } as any);
    let finish!: (value: any) => void;
    jest.mocked(getClientOrder).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await jest.advanceTimersByTimeAsync(120); });
      await act(async () => { await jest.advanceTimersByTimeAsync(15_000); });
      expect(getClientOrder).toHaveBeenCalledTimes(1);
      const reads = jest.mocked(getClientOrders).mock.calls.length;
      await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });
      expect(getClientOrder).toHaveBeenCalledTimes(1);
      expect(getClientOrders).toHaveBeenCalledTimes(reads);
      await act(async () => { finish({ ...pending, status: 'CONFIRMED', syncState: 'SYNCED', number1c: 'НОУТ-109710' }); });
      expect(harness.current.orders[0].syncState).toBe('SYNCED');
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('stops bulk sending when the network fails, preserving the remaining queue', async () => {
    const records = memoryDraftStore([localEntry('first', 'READY_TO_SEND'), localEntry('second', 'READY_TO_SEND')]);
    jest.mocked(getClientOrders).mockResolvedValue({ items: [], meta: { total: 0, limit: 20, offset: 0 } } as any);
    jest.mocked(putClientOrderByClientId).mockImplementation(async () => { setServerUnavailable('Network request failed'); throw new Error('Network request failed'); });
    const harness = await ordersListWorkspace();
    await act(async () => { await harness.current.syncDeviceDrafts({ force: true }); });
    expect(putClientOrderByClientId).toHaveBeenCalledTimes(1);
    expect(records.get('first').status).toBe('SEND_ERROR');
    expect(records.get('second').status).toBe('READY_TO_SEND');
    expect(records.size).toBe(2);
    await act(async () => harness.renderer.unmount());
  });

  it('makes a send interrupted by app restart retryable without changing its client identity', async () => {
    const pending = localEntry('interrupted', 'SENDING');
    const geo = { clientEventId: 'frozen-event', type: 'SUBMITTED', status: 'UNAVAILABLE', capturedAt: new Date().toISOString() };
    pending.payload.geoEvents = [geo] as any;
    const records = memoryDraftStore([pending]);
    jest.mocked(getClientOrders).mockResolvedValue({ items: [], meta: { total: 0, limit: 20, offset: 0 } } as any);
    jest.mocked(putClientOrderByClientId).mockResolvedValue(queuedOrder(1, { guid: 'api-interrupted', clientOrderId: pending.clientOrderId }) as any);
    const harness = await ordersListWorkspace();
    expect((harness.current.orders[0] as any).offlineDraftStatus).toBe('SEND_ERROR');
    await act(async () => { await harness.current.syncDeviceDrafts({ force: true }); });
    expect(putClientOrderByClientId).toHaveBeenCalledWith('interrupted', expect.objectContaining({ geoEvents: [geo] }),
      expect.objectContaining({ clientRevision: pending.clientRevision, intent: 'SUBMIT' }));
    expect(records.size).toBe(0);
    await act(async () => harness.renderer.unmount());
  });

  it('finishes offline pull-to-refresh immediately without waiting for a pending network request', async () => {
    setServerUnavailable('Network request failed');
    jest.mocked(getClientOrders).mockImplementation(() => new Promise(() => {}));
    const harness = await ordersListWorkspace();
    jest.mocked(getClientOrders).mockClear();
    await act(async () => { await harness.current.refreshOrders(); });
    expect(getClientOrders).not.toHaveBeenCalled();
    expect(harness.current.loadingOrders).toBe(false);
    await act(async () => harness.renderer.unmount());
  });

  it('prepares offline data on tap, shares progress and keeps the last date after a failed refresh', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({ items: [], meta: { total: 0, limit: 20, offset: 0, statusCounts: {} } } as any);
    jest.mocked(isOfflineDataReady).mockResolvedValue(false);
    jest.mocked(readOfflineDataSyncTime).mockResolvedValue(null);
    jest.mocked(readOfflineDatasetMeta).mockResolvedValue(null);
    let workspace!: ReturnType<typeof useClientOrdersWorkspace>;
    const Harness = () => { workspace = useClientOrdersWorkspace(); return null; };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(React.createElement(AuthContext.Provider, {
      value: { isLoading: false, isAuthenticated: true, profile: { id: 1 }, setAuthenticated: jest.fn(), setProfile: jest.fn(), signOut: jest.fn() } as any,
    }, React.createElement(Harness))); });
    await flush();
    expect(syncOfflineOrderData).not.toHaveBeenCalled();
    let finish!: (value: boolean) => void;
    jest.mocked(syncOfflineOrderData).mockImplementation((_, options) => {
      options?.onProgress?.({ progress: 0.4, error: null,
        transfer: { entity: 'catalog', updating: false, completed: 0, total: 12 } });
      return new Promise((resolve) => { finish = resolve; });
    });
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = workspace.refreshOfflineData(true);
      expect(workspace.refreshOfflineData(true)).toBe(pending);
    });
    expect(workspace.syncingOfflineData).toBe(true);
    expect(workspace.offlineDataProgress).toBe(0.4);
    expect(workspace.offlineDataTransfer).toEqual({ entity: 'catalog', updating: false, completed: 0, total: 12 });
    jest.mocked(isOfflineDataReady).mockResolvedValue(true);
    jest.mocked(readOfflineDataSyncTime).mockResolvedValue('2026-09-17T06:00:00Z');
    jest.mocked(readOfflineDatasetMeta).mockResolvedValue({ lastSourceUpdateAt: '2026-09-10T06:00:00Z', lastSyncedAt: '2026-09-17T06:00:00Z' } as any);
    await act(async () => { finish(true); await pending; });
    expect(workspace.syncingOfflineData).toBe(false);
    expect(workspace.offlineDataLoadedAt).toBe('2026-09-17T06:00:00Z');
    expect(workspace.offlineDataSyncedAt).toBe('2026-09-10T06:00:00Z');
    jest.mocked(syncOfflineOrderData).mockImplementation(async (_, options) => {
      options?.onProgress?.({ progress: null, error: 'Нет сети' });
      return false;
    });
    await act(async () => { await workspace.refreshOfflineData(true); });
    expect(workspace.offlineDataLoadedAt).toBe('2026-09-17T06:00:00Z');
    expect(workspace.offlineDataError).toBe('Нет сети');
    await act(async () => { renderer.unmount(); });
  });

  it('refreshes queued order metadata without reloading selected document detail', async () => {
    jest.mocked(getClientOrders)
      .mockResolvedValueOnce({
        items: [queuedOrder(1)],
        meta: { total: 1, limit: 20, offset: 0, statusCounts: { QUEUED: 1 }, liveSource: { status: 'ok' } },
      } as any)
      .mockResolvedValueOnce({
        items: [queuedOrder(2, { updatedAt: '2026-06-28T05:01:00.000Z' })],
        meta: { total: 1, limit: 20, offset: 0, statusCounts: { QUEUED: 1 }, liveSource: { status: 'ok' } },
      } as any);
    jest.mocked(getClientOrder).mockResolvedValue(queuedOrder(1, {
      items: [
        {
          product: { guid: 'product-guid', name: 'Товар' },
          quantity: 1,
          basePrice: 100,
        },
      ],
    }) as any);
    jest.mocked(getClientOrderInvoices).mockResolvedValue([{
      id: 'invoice-1',
      realizationGuid: 'realization-1',
      realizationNumber: 'НОУТ-H04002',
      version: 1,
      state: 'AVAILABLE',
      downloadAvailable: true,
    }] as any);

    let workspace: ReturnType<typeof useClientOrdersWorkspace>;
    function Harness() {
      workspace = useClientOrdersWorkspace();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthContext.Provider,
          {
            value: {
              isLoading: false,
              isAuthenticated: true,
              profile: { id: 1 } as any,
              setAuthenticated: jest.fn(),
              setProfile: jest.fn(),
              signOut: jest.fn(),
            },
          },
          React.createElement(Harness)
        )
      );
    });

    await flush();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();

    await act(async () => {
      await workspace!.selectOrder('order-guid');
    });
    await flush();

    expect(getClientOrder).toHaveBeenCalledTimes(1);
    expect(getClientOrderInvoices).toHaveBeenCalledWith('order-guid');
    expect(workspace!.selectedOrder?.invoiceDownloadAvailable).toBe(true);
    expect(workspace!.selectedOrder?.invoiceState).toBe('AVAILABLE');
    expect(workspace!.selectedOrder?.queuePosition).toBe(1);
    expect(workspace!.draft.items).toHaveLength(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000);
    });
    await flush();

    expect(getClientOrders).toHaveBeenCalledTimes(2);
    expect(getClientOrder).toHaveBeenCalledTimes(1);
    expect(workspace!.selectedOrder?.queuePosition).toBe(2);
    expect(workspace!.draft.items).toHaveLength(1);
    expect(workspace!.loadingDetail).toBe(false);

    await act(async () => {
      renderer!.unmount();
    });
  });

  it.each([
    {
      name: 'clears both resolved errors',
      fields: { last1cError: null, lastExportError: null },
      expected: { last1cError: null, lastExportError: null },
    },
    {
      name: 'clears the 1C error without hiding the export error',
      fields: { last1cError: null, lastExportError: 'Export failed' },
      expected: { last1cError: null, lastExportError: 'Export failed' },
    },
    {
      name: 'clears the export error without hiding the 1C error',
      fields: { last1cError: 'Posting failed', lastExportError: null },
      expected: { last1cError: 'Posting failed', lastExportError: null },
    },
    {
      name: 'preserves detail errors when the summary omits the fields',
      fields: {},
      expected: { last1cError: 'Posting failed', lastExportError: 'Export failed' },
    },
    {
      name: 'shows new errors even when the document is marked as posted',
      fields: { last1cError: 'New posting failure', lastExportError: 'New export failure' },
      expected: { last1cError: 'New posting failure', lastExportError: 'New export failure' },
    },
    {
      name: 'accepts empty error strings from older API responses',
      fields: { last1cError: '', lastExportError: '' },
      expected: { last1cError: '', lastExportError: '' },
    },
  ])('$name on list refresh without reloading the open document', async ({ fields, expected }) => {
    const original = queuedOrder(0, {
      status: 'CONFIRMED',
      syncState: 'SYNCED',
      number1c: 'НОУТ-114718',
      isPostedIn1c: true,
      last1cError: 'Posting failed',
      lastExportError: 'Export failed',
      items: [{ product: { guid: 'product-guid', name: 'Товар' }, quantity: 2, basePrice: 100 }],
    });
    const page = (order: typeof original) => ({
      items: [order],
      meta: { total: 1, limit: 20, offset: 0, statusCounts: {}, liveSource: { status: 'ok' } },
    });
    jest.mocked(getClientOrders).mockResolvedValue(page(original) as any);
    jest.mocked(getClientOrder).mockResolvedValue(original as any);
    let workspace!: ReturnType<typeof useClientOrdersWorkspace>;
    const Harness = () => { workspace = useClientOrdersWorkspace(); return null; };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(AuthContext.Provider, {
        value: { isLoading: false, isAuthenticated: true, profile: { id: 1 },
          setAuthenticated: jest.fn(), setProfile: jest.fn(), signOut: jest.fn() } as any,
      }, React.createElement(Harness)));
    });
    try {
      await act(async () => { await jest.advanceTimersByTimeAsync(0); });
      await flush();
      await act(async () => { await workspace.selectOrder('order-guid'); });
      await flush();
      expect(workspace.selectedOrderHas1cError).toBe(true);
      expect(getClientOrder).toHaveBeenCalledTimes(1);
      const originalDraftItems = workspace.draft.items;

      // Keep status, revision and timestamps unchanged: error fields alone
      // must invalidate the memoized UI state and the persisted list cache.
      const summary = { ...original, items: [], ...fields };
      if (!('last1cError' in fields)) delete summary.last1cError;
      if (!('lastExportError' in fields)) delete summary.lastExportError;
      jest.mocked(getClientOrders).mockResolvedValue(page(summary) as any);
      jest.mocked(AsyncStorage.setItem).mockClear();
      await act(async () => { await workspace.refreshOrders(); });
      await flush();

      expect(workspace.selectedOrder).toMatchObject(expected);
      expect(workspace.selectedOrderHas1cError).toBe(Boolean(expected.last1cError || expected.lastExportError));
      expect(workspace.draft.items).toEqual(originalDraftItems);
      expect(getClientOrder).toHaveBeenCalledTimes(1);
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      expect(submitClientOrder).not.toHaveBeenCalled();
      if ('last1cError' in fields && 'lastExportError' in fields) {
        expect(workspace.orders[0]).toMatchObject(expected);
        const cacheWrites = jest.mocked(AsyncStorage.setItem).mock.calls
          .filter(([key]) => key === 'client_orders_list_cache_v1:1');
        expect(cacheWrites.length).toBeGreaterThan(0);
        const persisted = JSON.parse(cacheWrites[cacheWrites.length - 1][1]);
        expect(persisted.orders[0]).toMatchObject(expected);
      }
    } finally {
      await act(async () => renderer.unmount());
    }
  });

  it('keeps one identity when edited during the first offline write, without sending on reconnect', async () => {
    setServerUnavailable('test');
    const harness = await editableWorkspace();
    let finish!: (saved: boolean) => void;
    jest.mocked(applyOfflineDraftChanges).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let pending!: ReturnType<typeof harness.current.saveDraft>;
    await act(async () => { pending = harness.current.saveDraft({ reason: 'manual' }); });
    expect(harness.current.autosaveState).not.toBe('saved');
    expect(harness.current.draft.guid).toBeFalsy();
    await act(async () => {
      harness.current.patchDraft(prev => ({ ...prev, items: prev.items.map(item => ({ ...item, quantity: '5' })) }));
    });
    await act(async () => { finish(true); expect(await pending).toBeNull(); });
    expect(harness.current.draft.guid).toBeFalsy();
    await act(async () => { expect(await harness.current.saveDraft({ reason: 'manual' })).not.toBeNull(); });
    const calls = jest.mocked(applyOfflineDraftChanges).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toHaveLength(1);
    expect(calls[1][1]).toHaveLength(1);
    expect(calls[1][1][0]).toMatchObject({
      id: calls[0][1][0].id, clientOrderId: calls[0][1][0].clientOrderId,
      clientRevision: calls[0][1][0].clientRevision + 1,
      payload: { items: [expect.objectContaining({ quantity: 5 })] },
    });
    expect(calls[1][2]).toEqual([]);
    expect(harness.current.autosaveState).toBe('saved');
    await act(async () => { setServerReachable(); await jest.advanceTimersByTimeAsync(5_000); });
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    expect(createClientOrder).not.toHaveBeenCalled();
    expect(submitClientOrder).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

  it.each(['reject', 'false'] as const)('does not report success or endlessly retry when local persistence returns %s', async mode => {
    setServerUnavailable('test');
    const harness = await editableWorkspace();
    if (mode === 'reject') jest.mocked(applyOfflineDraftChanges).mockRejectedValue(new Error('NativeStatement.finalizeAsync: UNIQUE constraint failed'));
    else jest.mocked(applyOfflineDraftChanges).mockResolvedValue(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    expect(harness.current.autosaveState).toBe('error');
    expect(harness.current.dirty).toBe(true);
    expect(harness.current.error).not.toMatch(/NativeStatement|UNIQUE|SQLite/);
    await act(async () => { await jest.advanceTimersByTimeAsync(5_000); });
    expect(applyOfflineDraftChanges).toHaveBeenCalledTimes(1);
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    jest.mocked(applyOfflineDraftChanges).mockResolvedValue(true);
    await act(async () => { expect(await harness.current.saveDraft({ reason: 'manual' })).not.toBeNull(); });
    expect(harness.current.autosaveState).toBe('saved');
    await act(async () => harness.renderer.unmount());
  });

  it('saves durably before treating a network failure as a successful local save', async () => {
    const harness = await editableWorkspace();
    jest.mocked(putClientOrderByClientId).mockRejectedValue(new Error('Network request failed'));
    await act(async () => { expect(await harness.current.saveDraft({ reason: 'manual' })).not.toBeNull(); });
    expect(applyOfflineDraftChanges).toHaveBeenCalledTimes(1);
    expect(harness.current.autosaveState).toBe('saved');
    expect(harness.current.dirty).toBe(false);
    await act(async () => harness.renderer.unmount());
  });

  it('does not send to the API if the durable staging write fails while online', async () => {
    const harness = await editableWorkspace();
    jest.mocked(applyOfflineDraftChanges).mockRejectedValue(new Error('SQLite disk full'));
    await act(async () => { expect(await harness.current.saveDraft({ reason: 'manual' })).toBeNull(); });
    expect(harness.current.autosaveState).toBe('error');
    expect(harness.current.dirty).toBe(true);
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

  it('allows a new edit to autosave after a failed write, without retrying the unchanged failing revision', async () => {
    setServerUnavailable('test');
    const harness = await editableWorkspace();
    jest.mocked(applyOfflineDraftChanges).mockRejectedValueOnce(new Error('SQLite disk full'));
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    expect(harness.current.autosaveState).toBe('error');
    await act(async () => { harness.current.patchDraft({ comment: 'New edit' }); });
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    expect(applyOfflineDraftChanges).toHaveBeenCalledTimes(2);
    expect(harness.current.autosaveState).toBe('saved');
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

  it('migrates duplicate legacy identities using the latest revision and removes the old data only after commit', async () => {
    const older = { id: 'old-row', clientOrderId: 'legacy-identity', clientRevision: 1, intent: 'SUBMIT',
      order: { guid: 'device-order-old', items: [], events: [] }, payload: { items: [], comment: 'old' } };
    const newer = { ...older, id: 'new-row', clientRevision: 2, payload: { items: [], comment: 'latest' } };
    jest.mocked(AsyncStorage.getItem).mockImplementation(async key => key.startsWith('client_orders_device_drafts_v1')
      ? JSON.stringify([older, newer]) : null);
    const harness = await editableWorkspace();
    expect(applyOfflineDraftChanges).toHaveBeenCalledTimes(1);
    expect(jest.mocked(applyOfflineDraftChanges).mock.calls[0][1]).toEqual([
      expect.objectContaining({ clientOrderId: 'legacy-identity', clientRevision: 2, status: 'NEEDS_EDIT', payload: newer.payload }),
    ]);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('client_orders_device_drafts_v1:1');
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

  it('keeps legacy drafts and blocks saving if their migration fails', async () => {
    const older = { id: 'old-row', clientOrderId: 'legacy-identity', clientRevision: 1,
      order: { guid: 'device-order-old', items: [], events: [] }, payload: { items: [] } };
    jest.mocked(AsyncStorage.getItem).mockImplementation(async key => key.startsWith('client_orders_device_drafts_v1')
      ? JSON.stringify([older]) : null);
    jest.mocked(applyOfflineDraftChanges).mockRejectedValue(new Error('SQLite disk full'));
    const harness = await editableWorkspace();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    await act(async () => { expect(await harness.current.saveDraft({ reason: 'manual' })).toBeNull(); });
    expect(harness.current.dirty).toBe(true);
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

  it('keeps a manual invoice request in the list and replaces it with the ready PDF state', async () => {
    const baseOrder = queuedOrder(0, {
      status: 'SENT_TO_1C',
      syncState: 'SYNCED',
      invoiceRequested: false,
      invoiceState: 'NOT_REQUESTED',
      invoiceCount: 0,
      invoiceDownloadAvailable: false,
    });
    const readyResult = {
      items: [{
        ...baseOrder,
        invoiceState: 'AVAILABLE',
        invoiceCount: 1,
        invoiceDownloadAvailable: true,
        latestInvoiceVersion: 1,
      }],
      meta: { total: 1, limit: 20, offset: 0, statusCounts: {}, liveSource: { status: 'ok' } },
    } as any;
    jest.mocked(getClientOrders)
      .mockResolvedValueOnce({
        items: [baseOrder],
        meta: { total: 1, limit: 20, offset: 0, statusCounts: {}, liveSource: { status: 'ok' } },
      } as any)
      // The first refresh may still return the pre-request list snapshot.
      .mockResolvedValueOnce({
        items: [baseOrder],
        meta: { total: 1, limit: 20, offset: 0, statusCounts: {}, liveSource: { status: 'ok' } },
      } as any)
      .mockResolvedValueOnce(readyResult);
    jest.mocked(getClientOrderInvoiceStatuses)
      .mockResolvedValueOnce([{
        identifier: 'order-guid',
        invoices: [],
      }] as any)
      .mockResolvedValueOnce([{
        identifier: 'order-guid',
        invoices: [{
          id: 'invoice-ready',
          realizationGuid: 'realization-guid',
          version: 1,
          state: 'AVAILABLE',
          downloadAvailable: true,
        }],
      }] as any);

    let workspace: ReturnType<typeof useClientOrdersWorkspace>;
    function Harness() {
      workspace = useClientOrdersWorkspace();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthContext.Provider,
          {
            value: {
              isLoading: false,
              isAuthenticated: true,
              profile: { id: 1 } as any,
              setAuthenticated: jest.fn(),
              setProfile: jest.fn(),
              signOut: jest.fn(),
            },
          },
          React.createElement(Harness)
        )
      );
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    await flush();

    await act(async () => {
      workspace!.applyInvoiceRequestResult('order-guid', [{
        id: 'invoice-pending',
        realizationGuid: 'realization-guid',
        version: 1,
        state: 'WAITING',
        downloadAvailable: false,
      }]);
    });
    await flush();
    expect(workspace!.orders[0]).toMatchObject({
      invoiceState: 'WAITING',
      invoiceRequestPending: true,
      invoiceDownloadAvailable: false,
    });
    expect(getClientOrders).toHaveBeenCalledTimes(1);
    expect(getClientOrderInvoiceStatuses).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    await flush();
    expect(getClientOrders).toHaveBeenCalledTimes(1);
    expect(getClientOrderInvoiceStatuses).toHaveBeenCalledTimes(2);
    expect(workspace!.orders[0]).toMatchObject({
      invoiceState: 'AVAILABLE',
      invoiceRequestPending: false,
      invoiceDownloadAvailable: true,
      latestInvoiceVersion: 1,
    });

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('allows retrying a synced 1C order with a posting error without local changes', async () => {
    const orderWithPostingError = queuedOrder(0, {
      status: 'SENT_TO_1C',
      syncState: 'SYNCED',
      number1c: 'LP-000001',
      queuePosition: null,
      last1cError: 'Не удалось провести документ: недостаточно остатка.',
      agreement: { guid: 'agreement-guid', name: 'Agreement' },
      contract: { guid: 'contract-guid', name: 'Contract' },
      warehouse: { guid: 'warehouse-guid', name: 'Warehouse' },
      deliveryAddress: { guid: 'address-guid', fullAddress: 'Address' },
      deliveryDate: '2026-06-30T00:00:00.000Z',
      items: [
        {
          product: { guid: 'product-guid', name: 'Product' },
          quantity: 1,
          basePrice: 100,
        },
      ],
    });
    jest.mocked(getClientOrders).mockResolvedValue({
      items: [orderWithPostingError],
      meta: { total: 1, limit: 20, offset: 0, statusCounts: { SENT_TO_1C: 1 }, liveSource: { status: 'ok' } },
    } as any);
    jest.mocked(getClientOrder).mockResolvedValue(orderWithPostingError as any);

    let workspace: ReturnType<typeof useClientOrdersWorkspace>;
    function Harness() {
      workspace = useClientOrdersWorkspace();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthContext.Provider,
          {
            value: {
              isLoading: false,
              isAuthenticated: true,
              profile: { id: 1 } as any,
              setAuthenticated: jest.fn(),
              setProfile: jest.fn(),
              signOut: jest.fn(),
            },
          },
          React.createElement(Harness)
        )
      );
    });

    await flush();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();

    await act(async () => {
      await workspace!.selectOrder('order-guid');
    });

    expect(workspace!.dirty).toBe(false);
    expect(workspace!.selectedOrderSynced).toBe(true);
    expect(workspace!.selectedOrderHas1cError).toBe(true);
    expect(workspace!.canSubmitOrder).toBe(true);

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('passes and applies status and warehouse filters for loaded orders', async () => {
    const draftOrder = queuedOrder(0, {
      guid: 'draft-guid',
      status: 'DRAFT',
      syncState: 'DRAFT',
      warehouse: { guid: 'warehouse-a', name: 'Склад А' },
    });
    const shippedOrder = queuedOrder(0, {
      guid: 'ship-guid',
      status: 'TO_SHIP',
      syncState: 'SYNCED',
      number1c: 'НОУТ-000001',
      origin: 'onec',
      currentState1c: 'К отгрузке',
      warehouse: { guid: 'warehouse-b', name: 'Склад Б' },
    });
    jest.mocked(getClientOrders).mockResolvedValue({
      items: [draftOrder, shippedOrder],
      meta: { total: 2, limit: 20, offset: 0, statusCounts: {}, liveSource: { status: 'ok' } },
    } as any);

    let workspace: ReturnType<typeof useClientOrdersWorkspace>;
    function Harness() {
      workspace = useClientOrdersWorkspace();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthContext.Provider,
          {
            value: {
              isLoading: false,
              isAuthenticated: true,
              profile: { id: 1 } as any,
              setAuthenticated: jest.fn(),
              setProfile: jest.fn(),
              signOut: jest.fn(),
            },
          },
          React.createElement(Harness)
        )
      );
    });

    await flush();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    await flush();

    await act(async () => {
      await workspace!.refreshOrders();
    });
    await flush();

    expect(workspace!.orders.map((order) => order.guid).sort()).toEqual(['draft-guid', 'ship-guid']);

    await act(async () => {
      workspace!.setFilters((prev) => ({
        ...prev,
        statuses: ['DRAFT'],
        warehouseGuid: 'warehouse-a',
      }));
    });
    await flush();
    await act(async () => {
      await workspace!.refreshOrders();
    });
    await flush();

    expect(getClientOrders).toHaveBeenLastCalledWith(expect.objectContaining({
      statuses: ['DRAFT'],
      warehouseGuid: 'warehouse-a',
    }));
    expect(workspace!.orders.map((order) => order.guid)).toEqual(['draft-guid']);

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('applies restricted payment and delivery defaults after counterparty selection', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({
      items: [],
      meta: { total: 0, limit: 20, offset: 0, statusCounts: {}, liveSource: { status: 'ok' } },
    } as any);
    jest.mocked(getClientOrderDefaults).mockResolvedValue({
      counterparty: {
        guid: 'counterparty-guid',
        name: 'Контрагент',
        hasDebt: true,
        shipmentProhibited: true,
        debtReason: 'Просрочена оплата по договору',
      },
      agreement: null,
      contract: null,
      warehouse: null,
      deliveryAddress: null,
      priceType: null,
      paymentForm: null,
      paymentForms: [
        { code: null, name: 'Любая', label: 'Любая' },
        { code: 'Наличная', name: 'Наличная', label: 'Наличная' },
      ],
      deliveryMethod: 'ДоКлиента',
      invoiceRequested: true,
      deliveryMethods: [
        { code: 'ДоКлиента', name: 'ДоКлиента', label: 'Наша доставка' },
        { code: 'Самовывоз', name: 'Самовывоз', label: 'Самовывоз' },
      ],
      currency: 'RUB',
      deliveryDate: '2026-06-30T00:00:00.000Z',
      warnings: [],
      hasDebt: true,
      shipmentProhibited: true,
      debtReason: 'Просрочена оплата по договору',
    } as any);

    let workspace: ReturnType<typeof useClientOrdersWorkspace>;
    function Harness() {
      workspace = useClientOrdersWorkspace();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthContext.Provider,
          {
            value: {
              isLoading: false,
              isAuthenticated: true,
              profile: { id: 1 } as any,
              setAuthenticated: jest.fn(),
              setProfile: jest.fn(),
              signOut: jest.fn(),
            },
          },
          React.createElement(Harness)
        )
      );
    });

    await flush();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    await flush();

    await act(async () => {
      await workspace!.setCounterparty({ guid: 'counterparty-guid', name: 'Контрагент' } as any);
    });
    await flush();

    expect(getClientOrderDefaults).toHaveBeenCalledWith(expect.objectContaining({
      organizationGuid: 'org-guid',
      counterpartyGuid: 'counterparty-guid',
    }));
    expect(workspace!.draft.paymentForm).toBeNull();
    expect(workspace!.draft.deliveryMethod).toBe('ДоКлиента');
    expect(workspace!.draft.invoiceRequested).toBe(true);
    expect(workspace!.shipmentProhibited).toBe(true);
    expect(workspace!.debtReason).toBe('Просрочена оплата по договору');

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('maps legacy payment and delivery values from an opened 1C document', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({
      items: [],
      meta: { total: 0, limit: 20, offset: 0, statusCounts: {}, liveSource: { status: 'ok' } },
    } as any);
    jest.mocked(getClientOrderDefaults).mockResolvedValue({
      counterparty: {
        guid: 'counterparty-guid',
        name: 'Контрагент',
        hasDebt: true,
        shipmentProhibited: true,
        debtReason: 'Просроченная задолженность из актуальных данных 1С',
      },
      paymentForm: null,
      paymentForms: [
        { code: null, name: 'Любая', label: 'Любая' },
        { code: 'Наличная', name: 'Наличная', label: 'Наличная' },
      ],
      deliveryMethod: 'Самовывоз',
      deliveryMethods: [
        { code: 'ДоКлиента', name: 'ДоКлиента', label: 'Наша доставка' },
        { code: 'Самовывоз', name: 'Самовывоз', label: 'Самовывоз' },
      ],
      hasDebt: true,
      shipmentProhibited: true,
      debtReason: 'Просроченная задолженность из актуальных данных 1С',
    } as any);
    jest.mocked(getClientOrder).mockResolvedValue(queuedOrder(0, {
      guid: 'legacy-order-guid',
      origin: 'onec',
      date1c: '2026-06-15T12:30:00',
      readOnly: true,
      hasRealization: true,
      status: 'TO_SHIP',
      syncState: 'SYNCED',
      organization: { guid: 'org-guid', name: 'Организация' },
      counterparty: { guid: 'counterparty-guid', name: 'Контрагент' },
      paymentForm: 'Безналичная',
      deliveryMethod: 'СиламиПеревозчика',
      deliveryDate: '2026-06-30T00:00:00.000Z',
      items: [
        {
          product: { guid: 'product-guid', name: 'Товар' },
          quantity: 1,
          basePrice: 100,
        },
      ],
    }) as any);
    jest.mocked(getClientOrderProductsBatch).mockResolvedValue([{
      guid: 'product-guid',
      name: 'Товар',
      receiptPrice: 80,
      packages: [],
    }] as any);

    let workspace: ReturnType<typeof useClientOrdersWorkspace>;
    function Harness() {
      workspace = useClientOrdersWorkspace();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthContext.Provider,
          {
            value: {
              isLoading: false,
              isAuthenticated: true,
              profile: { id: 1 } as any,
              setAuthenticated: jest.fn(),
              setProfile: jest.fn(),
              signOut: jest.fn(),
            },
          },
          React.createElement(Harness)
        )
      );
    });

    await flush();
    await act(async () => {
      await workspace!.selectOrder('legacy-order-guid');
    });
    await flush();

    expect(workspace!.draft.paymentForm).toBeNull();
    expect(workspace!.draft.deliveryMethod).toBe('ДоКлиента');
    expect(getClientOrderProductsBatch).toHaveBeenCalledWith(expect.objectContaining({
      productGuids: ['product-guid'],
      receiptPriceAt: '2026-06-15T12:30:00',
    }));
    expect(workspace!.draft.items[0].receiptPrice).toBe(80);
    expect(workspace!.shipmentProhibited).toBe(false);
    expect(workspace!.debtReason).toBeNull();

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('does not overwrite a manually selected delivery address with late defaults', async () => {
    const defaultAddress = { guid: 'address-default', fullAddress: 'Default address' };
    const manualAddress = { guid: 'address-manual', fullAddress: 'Manual address' };
    let resolveDefaults!: (value: any) => void;

    jest.mocked(getClientOrders).mockResolvedValue({
      items: [],
      meta: { total: 0, limit: 20, offset: 0, statusCounts: {}, liveSource: { status: 'ok' } },
    } as any);
    jest.mocked(getClientOrderDefaults).mockImplementation(() => new Promise((resolve) => {
      resolveDefaults = resolve;
    }) as any);

    let workspace: ReturnType<typeof useClientOrdersWorkspace>;
    function Harness() {
      workspace = useClientOrdersWorkspace();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthContext.Provider,
          {
            value: {
              isLoading: false,
              isAuthenticated: true,
              profile: { id: 1 } as any,
              setAuthenticated: jest.fn(),
              setProfile: jest.fn(),
              signOut: jest.fn(),
            },
          },
          React.createElement(Harness)
        )
      );
    });

    await flush();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    await flush();

    act(() => {
      void workspace!.setCounterparty({ guid: 'counterparty-guid', name: 'Counterparty' } as any);
    });
    await flush();

    act(() => {
      workspace!.setDeliveryAddress(manualAddress as any);
    });

    await act(async () => {
      resolveDefaults({
        agreement: null,
        contract: null,
        warehouse: null,
        deliveryAddress: defaultAddress,
        priceType: null,
        paymentForm: null,
        paymentForms: [],
        deliveryMethod: 'Самовывоз',
        deliveryMethods: [],
        currency: 'RUB',
        deliveryDate: '2026-06-30T00:00:00.000Z',
        warnings: [],
      });
    });
    await flush();

    expect(workspace!.draft.deliveryAddressGuid).toBe('address-manual');
    expect(workspace!.selections.deliveryAddress?.guid).toBe('address-manual');

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('keeps the selected delivery address visible after save when server returns another cached address', async () => {
    const defaultAddress = { guid: 'address-default', fullAddress: 'Default address' };
    const manualAddress = { guid: 'address-manual', fullAddress: 'Manual address' };
    const savedOrder = queuedOrder(0, {
      guid: 'new-order-guid',
      revision: 1,
      status: 'DRAFT',
      syncState: 'DRAFT',
      organization: { guid: 'org-guid', name: 'Organization' },
      counterparty: { guid: 'counterparty-guid', name: 'Counterparty' },
      deliveryAddress: defaultAddress,
      deliveryDate: '2026-06-30T00:00:00.000Z',
      items: [
        {
          product: { guid: 'product-guid', name: 'Product' },
          quantity: 1,
          basePrice: 100,
        },
      ],
    });

    jest.mocked(getClientOrders).mockResolvedValue({
      items: [],
      meta: { total: 0, limit: 20, offset: 0, statusCounts: {}, liveSource: { status: 'ok' } },
    } as any);
    jest.mocked(putClientOrderByClientId).mockResolvedValue(savedOrder as any);

    let workspace: ReturnType<typeof useClientOrdersWorkspace>;
    function Harness() {
      workspace = useClientOrdersWorkspace();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthContext.Provider,
          {
            value: {
              isLoading: false,
              isAuthenticated: true,
              profile: { id: 1 } as any,
              setAuthenticated: jest.fn(),
              setProfile: jest.fn(),
              signOut: jest.fn(),
            },
          },
          React.createElement(Harness)
        )
      );
    });

    await flush();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    await flush();

    await act(async () => {
      workspace!.patchDraft({
        organizationGuid: 'org-guid',
        counterpartyGuid: 'counterparty-guid',
        deliveryDate: '2026-06-30T00:00:00.000Z',
        items: [
          {
            key: 'line-key',
            lineGuid: 'line-guid',
            productGuid: 'product-guid',
            productName: 'Product',
            quantity: '1',
            packageGuid: null,
            manualPrice: '',
            discountPercent: '',
            comment: '',
            basePrice: 100,
            receiptPrice: null,
            baseUnit: { name: 'pcs', symbol: 'pcs' },
            packages: [],
          },
        ],
      });
      workspace!.setDeliveryAddress(manualAddress as any);
    });
    await flush();

    await act(async () => {
      await workspace!.saveDraft({ reason: 'manual' });
    });
    await flush();

    expect(putClientOrderByClientId).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ deliveryAddressGuid: 'address-manual' }),
      expect.objectContaining({ intent: 'SAVE' })
    );
    expect(workspace!.draft.deliveryAddressGuid).toBe('address-manual');
    expect(workspace!.selections.deliveryAddress?.guid).toBe('address-manual');

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('keeps submitted document open when current list filters exclude it', async () => {
    const savedOrder = queuedOrder(0, {
      guid: 'new-order-guid',
      revision: 1,
      status: 'DRAFT',
      syncState: 'DRAFT',
      counterparty: { guid: 'other-counterparty-guid', name: 'Другой контрагент' },
      agreement: { guid: 'agreement-guid', name: 'Соглашение' },
      contract: { guid: 'contract-guid', name: 'Договор' },
      warehouse: { guid: 'warehouse-guid', name: 'Склад' },
      deliveryAddress: { guid: 'address-guid', fullAddress: 'Адрес' },
      deliveryDate: '2026-06-30T00:00:00.000Z',
      items: [
        {
          product: { guid: 'product-guid', name: 'Товар' },
          quantity: 1,
          basePrice: 100,
        },
      ],
    });
    const submittedOrder = {
      ...savedOrder,
      revision: 2,
      status: 'SENT_TO_1C',
      syncState: 'SYNCED',
      number1c: 'НОУТ-000001',
    };

    jest.mocked(getClientOrders).mockResolvedValue({
      items: [],
      meta: { total: 0, limit: 20, offset: 0, statusCounts: {}, liveSource: { status: 'ok' } },
    } as any);
    jest.mocked(putClientOrderByClientId).mockResolvedValue(submittedOrder as any);

    let workspace: ReturnType<typeof useClientOrdersWorkspace>;
    function Harness() {
      workspace = useClientOrdersWorkspace();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthContext.Provider,
          {
            value: {
              isLoading: false,
              isAuthenticated: true,
              profile: { id: 1 } as any,
              setAuthenticated: jest.fn(),
              setProfile: jest.fn(),
              signOut: jest.fn(),
            },
          },
          React.createElement(Harness)
        )
      );
    });

    await flush();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    await flush();

    await act(async () => {
      workspace!.setFilters((prev) => ({ ...prev, counterpartyGuid: 'filtered-counterparty-guid' }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    await flush();

    await act(async () => {
      workspace!.patchDraft({
        organizationGuid: 'org-guid',
        counterpartyGuid: 'other-counterparty-guid',
        agreementGuid: 'agreement-guid',
        contractGuid: 'contract-guid',
        warehouseGuid: 'warehouse-guid',
        deliveryAddressGuid: 'address-guid',
        deliveryDate: '2026-06-30T00:00:00.000Z',
        priceTypeGuid: 'price-type-guid',
        items: [
          {
            key: 'line-key',
            lineGuid: 'line-guid',
            productGuid: 'product-guid',
            productName: 'Товар',
            quantity: '1',
            packageGuid: null,
            manualPrice: '',
            discountPercent: '',
            comment: '',
            basePrice: 100,
            receiptPrice: null,
            priceTypeGuid: 'price-type-guid',
            baseUnit: { name: 'шт', symbol: 'шт' },
            packages: [],
          },
        ],
      });
    });
    await flush();

    await act(async () => {
      await workspace!.submitOrder();
    });
    await flush();

    expect(putClientOrderByClientId).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ intent: 'SUBMIT' })
    );
    expect(createClientOrder).not.toHaveBeenCalled();
    expect(submitClientOrder).not.toHaveBeenCalled();
    expect(workspace!.orders).toEqual([]);
    expect(workspace!.selectedGuid).toBe('new-order-guid');
    expect(workspace!.selectedOrder?.guid).toBe('new-order-guid');
    expect(workspace!.draft.guid).toBe('new-order-guid');
    expect(workspace!.draft.counterpartyGuid).toBe('other-counterparty-guid');
    expect(workspace!.draft.items).toHaveLength(1);
    expect(workspace!.draftMode).toBe(false);

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('refreshes today summary only while the orders screen is active', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({
      items: [],
      meta: { total: 0, limit: 20, offset: 0, statusCounts: {} },
    } as any);
    jest.mocked(getClientOrdersTodaySummary).mockResolvedValue({
      date: currentOmskDate(),
      ordersCount: 3,
      clientsCount: 2,
      totalAmount: 5000,
      profit: 700,
      profitAvailable: true,
      missingReceiptPriceCount: 0,
      currency: 'RUB',
      calculatedAt: new Date().toISOString(),
    });

    let workspace: ReturnType<typeof useClientOrdersWorkspace>;
    function Harness({ mode }: { mode: 'orders' | 'editor' }) {
      workspace = useClientOrdersWorkspace({ screenMode: mode, isScreenActive: true });
      return null;
    }
    const renderTree = (mode: 'orders' | 'editor') => React.createElement(
      AuthContext.Provider,
      {
        value: {
          isLoading: false,
          isAuthenticated: true,
          profile: { id: 1 } as any,
          setAuthenticated: jest.fn(),
          setProfile: jest.fn(),
          signOut: jest.fn(),
        },
      },
      React.createElement(Harness, { mode })
    );

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(renderTree('orders'));
    });
    await flush();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();

    expect(getClientOrdersTodaySummary).toHaveBeenCalledTimes(1);
    expect(workspace!.todaySummary).toMatchObject({ ordersCount: 3, clientsCount: 2 });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    await flush();
    expect(getClientOrdersTodaySummary).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer!.update(renderTree('editor'));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    await flush();
    expect(getClientOrdersTodaySummary).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer!.unmount();
    });
  });
});
jest.mock('../src/shared/monitoring', () => ({ captureException: jest.fn(), addMonitoringBreadcrumb: jest.fn() }));
