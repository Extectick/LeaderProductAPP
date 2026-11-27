import {ONEC_CONNECTION_UNAVAILABLE_MESSAGE, SERVER_CONNECTION_UNAVAILABLE_MESSAGE} from '@/src/shared/errors/userErrorMessage';
jest.mock('@/utils/apiClient', () => ({apiClient: jest.fn()}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { captureException } from '../src/shared/monitoring';
import { useOrderLoopStage } from '../src/features/clientOrders/screen/orderLoopStage';
import { ClientOrdersErrorBoundary } from '../src/features/clientOrders/screen/ClientOrdersErrorBoundary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
jest.mock('../src/features/clientOrders/offline/orderOutbox', () => ({ kickOrderOutbox: jest.fn(), retryOrderOutboxNow: jest.fn(async () => {}), isAsyncOrderOutboxEnabled: jest.fn(() => false) }));
jest.mock('../src/features/clientOrders/offline/orderOutboxDatabase', () => ({ readOrderMirrors: jest.fn(async () => []),
  refreshOrderMirrors: jest.fn(async () => {}), retireRedundantDeviceDraft: jest.fn(async () => null) }));

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
  StyleSheet: {create: (styles: unknown) => styles}, View: 'View', Text: 'Text', Pressable: 'Pressable',
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
  readOfflineDraftStamps: jest.fn(async () => []),
  applyOfflineDraftChanges: jest.fn(async () => true),
  canAdoptLegacyOfflineDrafts: async () => true,
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
  backupClientOrderDraft: jest.fn(),
  probeClientOrdersConnection: jest.fn(),
  getClientOrderByClientId: jest.fn(),
  getClientOrderStates: jest.fn(async () => { throw new Error('Old API fallback'); }),
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
  previewClientOrderAmendment: jest.fn(),
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
import { isOfflineDataReady, readOfflineDataSyncTime, readOfflineDatasetMeta, readOfflineDrafts, readOfflineDraftStamps, applyOfflineDraftChanges } from '../src/features/clientOrders/offline/offlineOrdersDatabase';
import { setServerReachable, setServerUnavailable } from '../src/shared/network/serverStatus';
import { syncOfflineOrderData } from '../src/features/clientOrders/offline/offlineOrdersSync';
import { buildLocalDraftPayload, emptyDraft } from '../src/features/clientOrders/clientOrdersShared';
import {
  backupClientOrderDraft,
  probeClientOrdersConnection,
  getClientOrderByClientId,
  getClientOrderStates,
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
  previewClientOrderAmendment,
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

  it('keeps the line editor callback stable across edits and fetches metadata for the current draft', async () => {
    const harness = await editableWorkspace();
    const batch = jest.mocked(getClientOrderProductsBatch);
    batch.mockResolvedValue([]);
    try {
      const enrich = harness.current.enrichItemMetadata;
      const line = harness.current.draft.items[0];
      await act(async () => harness.current.patchDraft({ items: [
        line, { ...line, key: 'untouched', lineGuid: 'other-line', productGuid: 'other-product' },
      ] }));
      const untouched = harness.current.draft.items[1];
      await act(async () => harness.current.setItemPatch(line.key, { manualPrice: '151' }));
      expect(harness.current.draft.items[1]).toBe(untouched);
      expect(harness.current.enrichItemMetadata).toBe(enrich);
      await act(async () => harness.current.patchDraft({ warehouseGuid: 'new-warehouse' }));
      batch.mockClear();
      await act(async () => { await enrich('untouched'); });
      expect(batch).toHaveBeenCalledWith(expect.objectContaining({
        warehouseGuid: 'new-warehouse', productGuids: ['other-product'],
      }));
    } finally {
      await act(async () => harness.renderer.unmount());
    }
  });

  it('prices mobile picker additions and retries an existing missing line after another tap', async () => {
    const harness = await editableWorkspace();
    const cheese = {guid: 'gouda', name: 'Сыр Гауда', packages: [], receiptPrice: 1422.2, basePrice: null};
    const batch = jest.mocked(getClientOrderProductsBatch);
    batch.mockResolvedValue([]);
    try {
      await act(async () => { harness.current.changePickerQuantity(cheese, {delta: 1}); });
      const first = harness.current.draft.items.find(line => line.productGuid === cheese.guid)!;
      expect(harness.current.pendingItemPriceKeys.has(first.key)).toBe(true);
      await act(async () => { await jest.advanceTimersByTimeAsync(250); });
      expect(harness.current.pendingItemPriceKeys.size).toBe(0);
      const onlineReads = () => batch.mock.calls.filter(call => call[1]?.onlineOnly);
      expect(onlineReads()).toHaveLength(1);
      batch.mockResolvedValue([{...cheese, basePrice: 1660}]);
      await act(async () => {
        harness.current.changePickerQuantity({...cheese, basePrice: 1660}, {delta: 1});
        harness.current.changePickerQuantity({...cheese, basePrice: 1660}, {delta: 1});
      });
      await act(async () => { await jest.advanceTimersByTimeAsync(250); });
      expect(onlineReads()).toHaveLength(2);
      expect(harness.current.draft.items.find(line => line.key === first.key)).toMatchObject({quantity: '3', basePrice: 1660});
      expect(harness.current.draft.items[0].basePrice).toBe(100);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('retains a global price chosen before the customer, but resets it when switching to a different customer', async () => {
    const harness = await editableWorkspace();
    const fallback = {guid: 'regular', name: 'Обычная'};
    jest.mocked(getClientOrderDefaults).mockResolvedValue({priceType: fallback, readState: freshRead});
    try {
      await act(async () => harness.current.setCounterparty(null));
      await act(async () => harness.current.setHeaderPriceType({guid: 'special', name: 'Сырнев'}));
      await act(async () => harness.current.setCounterparty({guid: 'first-customer', name: 'Первый'} as any));
      expect(harness.current.draft.priceTypeGuid).toBe('special');
      await act(async () => harness.current.setCounterparty({guid: 'second-customer', name: 'Второй'} as any));
      expect(harness.current.draft.priceTypeGuid).toBe('regular');
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('refreshes the same product at distinct row prices and retains both in a saved device draft', async () => {
    const harness = await editableWorkspace();
    const batch = jest.mocked(getClientOrderProductsBatch);
    const records = memoryDraftStore();
    batch.mockImplementation(async ({priceTypeGuid}) => [{guid: 'product-guid', basePrice: priceTypeGuid === 'special' ? 225 : 100}] as any);
    try {
      await act(async () => harness.current.patchDraft(prev => ({
        ...prev, warehouseGuid: 'new-warehouse', priceTypeGuid: 'regular', priceTypeName: 'Обычная', items: [
          {...prev.items[0], priceTypeGuid: 'regular', priceTypeName: 'Обычная'},
          {...prev.items[0], key: 'second-key', lineGuid: 'second-line', priceTypeGuid: 'special', priceTypeName: 'Сырнев'},
        ],
      })));
      await act(async () => { await jest.advanceTimersByTimeAsync(200); });
      expect(batch).toHaveBeenCalledWith(expect.objectContaining({priceTypeGuid: 'special', organizationGuid: 'org-guid', counterpartyGuid: 'counterparty-guid', warehouseGuid: 'new-warehouse'}));
      const expected = [{priceTypeGuid: 'regular', basePrice: 100}, {priceTypeGuid: 'special', basePrice: 225}];
      expect(harness.current.draft.items).toMatchObject(expected);
      await act(async () => { await harness.current.saveDraft({reason: 'manual', localOnly: true}); });
      expect([...records.values()][0].order.localDraft.items).toMatchObject(expected);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it.each(['success', 'failure'])('ignores an older line price %s after the employee selects a different type', async outcome => {
    const harness = await editableWorkspace();
    const batch = jest.mocked(getClientOrderProductsBatch);
    let resolveFirst!: (value: any[]) => void;
    let rejectFirst!: (error: Error) => void;
    batch.mockImplementation(async request => {
      if (request.priceTypeGuid === 'first') return new Promise((resolve, reject) => {
        resolveFirst = resolve; rejectFirst = reject;
      });
      return [{guid: 'product-guid', basePrice: 225}] as any;
    });
    try {
      await act(async () => harness.current.setItemPriceType('line-key', {guid: 'first', name: 'Первая'}));
      await act(async () => harness.current.setItemPriceType('line-key', {guid: 'special', name: 'Сырнев'}));
      await act(async () => {
        if (outcome === 'success') resolveFirst([{guid: 'product-guid', basePrice: 100}]);
        else rejectFirst(new Error('request expired'));
      });
      expect(harness.current.draft.items[0]).toMatchObject({priceTypeGuid: 'special', priceTypeName: 'Сырнев', basePrice: 225});
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('a late header-price error cannot clear prices from products added while it was in flight', async () => {
    const harness = await editableWorkspace();
    let rejectHeader!: (error: Error) => void;
    const batch = jest.mocked(getClientOrderProductsBatch);
    batch.mockImplementation(async (_payload, options) => {
      if (options?.onlineOnly) return [];
      return new Promise((_resolve, reject) => { rejectHeader = reject; });
    });
    try {
      await act(async () => { await jest.advanceTimersByTimeAsync(190); });
      await act(async () => { harness.current.changePickerQuantity({guid: 'gouda', name: 'Гауда', basePrice: 1660}, {delta: 1}); });
      await act(async () => rejectHeader(new Error('timeout')));
      expect(harness.current.draft.items.find(line => line.productGuid === 'gouda')?.basePrice).toBe(1660);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('does not lock a new order while an unrelated device packet is API_ACCEPTED', async () => {
    const entry = localEntry('previous-packet', 'API_ACCEPTED');
    memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    try {
      expect(harness.current.selectedGuid).toBeNull();
      expect(harness.current.readOnly).toBe(false);
      await act(async () => { await harness.current.createNewOrder(); });
      expect(harness.current.selectedOrder).toBeNull();
      expect(harness.current.readOnly).toBe(false);
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      expect(harness.current.readOnly).toBe(true);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('keeps only the actively sending document read-only, not a new form', async () => {
    const entry = localEntry('previous-packet', 'READY_TO_SEND');
    memoryDraftStore([entry]);
    let finish!: (order: any) => void;
    jest.mocked(putClientOrderByClientId).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const harness = await ordersListWorkspace();
    let sending!: Promise<void>;
    try {
      await act(async () => { sending = harness.current.syncDeviceDrafts({ force: true }); });
      expect(harness.current.syncingDeviceDrafts).toBe(true);
      expect(harness.current.readOnly).toBe(false);
      await act(async () => { await harness.current.createNewOrder(); });
      expect(harness.current.readOnly).toBe(false);
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      expect(harness.current.readOnly).toBe(true);
    } finally {
      if (finish) await act(async () => { finish(queuedOrder(1, { clientOrderId: 'previous-packet' })); await sending; });
      await act(async () => harness.renderer.unmount());
    }
  });

  it('does not apply a previous order invoice result to a fresh unsent draft', async () => {
    const harness = await editableWorkspace();
    try {
      const before = harness.current.draft;
      await act(async () => {
        harness.current.applyInvoiceRequestResult('previous-order', [{ id: 'old-invoice',
          realizationGuid: 'old-realization', version: 1, state: 'WAITING', downloadAvailable: false }]);
      });
      expect(harness.current.selectedOrder).toBeNull();
      expect(harness.current.draft).toEqual(before);
      expect(harness.current.draft.invoiceRequested).toBeFalsy();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('does not let an old save closure persist stale quantities while a picker edit is pending', async () => {
    const harness = await editableWorkspace();
    const oldSave = harness.current.saveDraft;
    await act(async () => {
      React.startTransition(() => harness.current.patchDraft(prev => ({ ...prev,
        items: prev.items.map(line => ({ ...line, quantity: '5' })),
      })));
      expect(await oldSave({ reason: 'autosave' })).toBeNull();
    });
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    expect(updateClientOrder).not.toHaveBeenCalled();
    expect(harness.current.draft.items[0].quantity).toBe('5');
    expect(harness.current.dirty).toBe(true);
    await act(async () => harness.renderer.unmount());
  });

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
    jest.requireMock('../src/features/clientOrders/offline/orderOutboxDatabase').readOrderMirrors.mockResolvedValue([]);
    jest.requireMock('../src/features/clientOrders/offline/orderOutbox').isAsyncOrderOutboxEnabled.mockReturnValue(false);
    jest.useFakeTimers();
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
    setServerReachable();
    jest.mocked(backupClientOrderDraft).mockImplementation(async (_id, clientRevision) => ({ clientRevision, savedAt: new Date().toISOString(), submittedOrderGuid: null }));
    jest.mocked(probeClientOrdersConnection).mockResolvedValue(false);
    jest.mocked(getClientOrderByClientId).mockRejectedValue(new Error('Not found'));
    jest.mocked(getClientOrderStates).mockRejectedValue(new Error('Old API fallback'));
    jest.mocked(readOfflineDrafts).mockResolvedValue([]);
    jest.mocked(readOfflineDraftStamps).mockResolvedValue([]);
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

  async function ordersListWorkspace(userId = 1, screenMode: 'orders' | 'editor' = 'orders') {
    let current!: ReturnType<typeof useClientOrdersWorkspace>;
    const Harness = () => { current = useClientOrdersWorkspace({ screenMode }); return null; };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(AuthContext.Provider, {
        value: { isLoading: false, isAuthenticated: true, profile: { id: userId },
          setAuthenticated: jest.fn(), setProfile: jest.fn(), signOut: jest.fn() } as any,
      }, React.createElement(Harness)));
    });
    await flush();
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    return { get current() { return current; }, renderer,
      async switchUser(id: number) {
        await act(async () => {
          renderer.update(React.createElement(AuthContext.Provider, {
            value: { isLoading: false, isAuthenticated: true, profile: { id },
              setAuthenticated: jest.fn(), setProfile: jest.fn(), signOut: jest.fn() } as any,
          }, React.createElement(Harness)));
        });
      },
    };
  }

  it('shows a new cancellation refusal once without putting it on the document or list', async () => {
    const service = jest.requireMock('@/utils/clientOrdersService');
    service.cancelClientOrder.mockRejectedValueOnce(Object.assign(new Error('По заказу есть реализация'), {
      errorDetails: { action: 'CANCEL_DENIED' }, backendErrorCode: 'CONFLICT',
    }));
    const harness = await ordersListWorkspace();
    try {
      const oldError = harness.current.error;
      const oldOrdersError = harness.current.ordersError;
      await act(async () => { await harness.current.cancelOrderConfirmed({ guid: 'app-order', revision: 1 }); });
      expect(jest.requireMock('react-native').Alert.alert).toHaveBeenCalledWith('Отмена не выполнена', expect.stringContaining('реализация'));
      expect(harness.current.error).toBe(oldError);
      expect(harness.current.ordersError).toBe(oldOrdersError);
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('reconciles queued orders through the DB-only batch and rejects a late queued list snapshot', async () => {
    const old = queuedOrder(1, { clientOrderId: 'client-order-123', deliveryDate: '2026-10-26' });
    jest.mocked(getClientOrders).mockResolvedValue({ items: [old], meta: { total: 1, limit: 20, offset: 0 } } as any);
    jest.mocked(getClientOrderStates).mockResolvedValue([{ ...old, revision: 5, clientRevision: 1,
      createdByUser: { id: 1 }, isPostedIn1c: true, status: 'CONFIRMED', syncState: 'SYNCED', number1c: 'НОУТ-128623',
      updatedAt: '2026-10-26T06:00:00Z' }] as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.refreshOrders(); });
      await act(async () => { await jest.advanceTimersByTimeAsync(31_000); });
      expect(getClientOrderStates).toHaveBeenCalledWith(expect.arrayContaining(['client-order-123']), '1', []);
      expect(harness.current.orders[0]).toMatchObject({ number1c: 'НОУТ-128623', isPostedIn1c: true, syncState: 'SYNCED' });
      expect(getClientOrder).not.toHaveBeenCalled();
      await act(async () => { await harness.current.refreshOrders(); });
      expect(harness.current.orders[0].syncState).toBe('SYNCED');
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('does not loop reconciliation for an unchanged native mirror or poll while backgrounded', async () => {
    const mirror = queuedOrder(0, { clientOrderId: 'mirrored-client-id', createdByUser: { id: 1 } });
    const state = { ...mirror, revision: 5, status: 'CONFIRMED', syncState: 'SYNCED', isPostedIn1c: true, number1c: 'НОУТ-128623' };
    jest.requireMock('../src/features/clientOrders/offline/orderOutboxDatabase').readOrderMirrors.mockImplementation(async () => [{ ...mirror }]);
    let calls = 0;
    jest.mocked(getClientOrderStates).mockImplementation(async () => {
      // Stop a regression from hanging the test; the assertion still catches the loop.
      if (++calls > 8) throw new Error('Reconciliation loop');
      return [state] as any;
    });
    jest.mocked(getClientOrders).mockResolvedValue({ items: [state], meta: { total: 1, limit: 20, offset: 0 } } as any);
    const harness = await ordersListWorkspace();
    try {
      for (let step = 0; step < 12; step++) await flush();
      expect(calls).toBeGreaterThan(0);
      expect(calls).toBeLessThanOrEqual(2);
      const before = calls;
      (AppState as any).currentState = 'background';
      await act(async () => { await jest.advanceTimersByTimeAsync(60_000); });
      expect(calls).toBe(before);
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
    } finally { (AppState as any).currentState = 'active'; await act(async () => harness.renderer.unmount()); }
  });

  it('rerenders posting-only changes even when revision, total and status text are unchanged', async () => {
    const old = queuedOrder(0, { status: 'CONFIRMED', syncState: 'SYNCED', number1c: 'НОУТ-128912',
      shipmentProhibited: true, isPostedIn1c: false });
    jest.mocked(getClientOrders).mockResolvedValue({ items: [old], meta: { total: 1, limit: 20, offset: 0 } } as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.refreshOrders(); });
      expect(harness.current.orders[0].isPostedIn1c).toBe(false);
      jest.mocked(getClientOrders).mockResolvedValue({ items: [{ ...old, isPostedIn1c: true }], meta: { total: 1, limit: 20, offset: 0 } } as any);
      await act(async () => { await harness.current.refreshOrders(); });
      expect(harness.current.orders[0].isPostedIn1c).toBe(true);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('applies shipment-date filters to retained queued rows and late server pages', async () => {
    const wrong = queuedOrder(1, { guid: 'previous-day', deliveryDate: '2026-10-25T23:59:59Z' });
    const right = queuedOrder(2, { guid: 'selected-day', deliveryDate: '2026-10-26T00:00:00Z', createdAt: '2026-10-23T08:00:00Z' });
    jest.mocked(getClientOrders).mockResolvedValue({ items: [wrong, right], meta: { total: 2, limit: 20, offset: 0 } } as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => harness.current.setFilters(prev => ({ ...prev, deliveryDateFrom: '2026-10-26', deliveryDateTo: '2026-10-26' })));
      await act(async () => { await harness.current.refreshOrders(); });
      expect(harness.current.orders.map(order => order.guid)).toEqual(['selected-day']);
      await act(async () => harness.current.setFilters(prev => ({ ...prev, deliveryDateFrom: '2026-10-27', deliveryDateTo: '2026-10-27' })));
      await act(async () => { await harness.current.refreshOrders(); });
      expect(harness.current.orders).toEqual([]);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

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
      expect(harness.current.ordersError).toBe(ONEC_CONNECTION_UNAVAILABLE_MESSAGE);
      expect(harness.current.ordersConnectionNotice).toBeNull();
    } finally {
      await act(async () => harness.renderer.unmount());
    }
  });

  it('recovers a stale read error from a verified background snapshot, but not from a cached pending page', async () => {
    const saved = queuedOrder(0, {status: 'CONFIRMED', syncState: 'SYNCED'});
    const page = {items: [saved], meta: {total: 1, limit: 20, offset: 0}};
    jest.mocked(getClientOrders).mockResolvedValue({...page, meta: {...page.meta,
      liveSource: {status: 'unavailable', message: 'Нет связи с 1С'}}} as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => {await harness.current.refreshOrders();});
      expect(harness.current.ordersError).toBe(ONEC_CONNECTION_UNAVAILABLE_MESSAGE);
      const stale = {source: 'local', checkedAt: null, stale: true, refreshPending: false, verificationRequired: true};
      jest.mocked(getClientOrders).mockResolvedValue({...page, items: [{...saved, readState: stale}],
        meta: {...page.meta, readState: stale, liveSource: {status: 'pending', message: 'Проверяем документы в 1С'}}} as any);
      await act(async () => {await jest.advanceTimersByTimeAsync(3_000);});
      await flush();
      expect(harness.current.ordersError).toBe(ONEC_CONNECTION_UNAVAILABLE_MESSAGE);
      expect(harness.current.orders[0].readState?.verificationRequired).toBe(true);
      const verified = {...stale, source: 'verified-snapshot', checkedAt: new Date().toISOString(), stale: false, verificationRequired: false};
      jest.mocked(getClientOrders).mockResolvedValue({...page, items: [{...saved, readState: verified}], meta: {...page.meta, readState: verified}} as any);
      await act(async () => {await jest.advanceTimersByTimeAsync(10_000);});
      await flush();
      expect(harness.current.ordersError).toBeNull();
      expect(harness.current.orders[0].readState?.verificationRequired).toBe(false);
    } finally {await act(async () => harness.renderer.unmount());}
  });

  it('automatically replaces pending local status with the verified 1C status', async () => {
    const pending = {source: 'local', checkedAt: null, stale: true, refreshPending: true, verificationRequired: true};
    const verified = {source: 'verified-snapshot', checkedAt: new Date().toISOString(), stale: false, refreshPending: false, verificationRequired: false};
    const saved = queuedOrder(0, {status: 'CONFIRMED', syncState: 'SYNCED', number1c: 'НОУТ-141919', readState: pending} as any);
    const page = {items: [saved], meta: {total: 1, limit: 20, offset: 0, readState: pending, liveSource: {status: 'pending', message: 'Проверяем документы в 1С'}}};
    jest.mocked(getClientOrders).mockResolvedValue(page as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => {await jest.advanceTimersByTimeAsync(150);});
      expect(harness.current.ordersError).toBeNull();
      expect(harness.current.orders[0].readState?.verificationRequired).toBe(true);
      jest.mocked(getClientOrders).mockResolvedValue({...page,
        items: [{...saved, status: 'SHIPPING_IN_PROGRESS', readState: verified}],
        meta: {...page.meta, readState: verified, liveSource: {status: 'ok'}}} as any);
      await act(async () => {await jest.advanceTimersByTimeAsync(2_000);}); await flush();
      expect(harness.current.orders[0].status).toBe('SHIPPING_IN_PROGRESS');
      expect(harness.current.orders[0].readState?.verificationRequired).toBe(false);
      expect(harness.current.ordersError).toBeNull();
    } finally {await act(async () => harness.renderer.unmount());}
  });

  it.each(['pending', 'failure'])('ignores an older foreground %s after a newer silent verified response', async outcome => {
    const saved = queuedOrder(0, {status: 'CONFIRMED', syncState: 'SYNCED'});
    const page = {items: [saved], meta: {total: 1, limit: 20, offset: 0}};
    jest.mocked(getClientOrders).mockResolvedValue({...page, meta: {...page.meta, liveSource: {status: 'unavailable', message: 'Нет связи с 1С'}}} as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => {await jest.advanceTimersByTimeAsync(150);});
      expect(harness.current.ordersError).toBe(ONEC_CONNECTION_UNAVAILABLE_MESSAGE);
      let resolveOld!: (value: any) => void; let rejectOld!: (error: any) => void;
      const old = new Promise<any>((resolve, reject) => {resolveOld = resolve; rejectOld = reject;});
      const verified = {source: 'verified-snapshot', checkedAt: new Date().toISOString(), stale: false, refreshPending: false, verificationRequired: false};
      jest.mocked(getClientOrders).mockImplementationOnce(() => old).mockResolvedValue({...page,
        items: [{...saved, status: 'SHIPPING_IN_PROGRESS', readState: verified}], meta: {...page.meta, readState: verified}} as any);
      let foreground!: Promise<any>;
      await act(async () => {foreground = harness.current.refreshOrders();});
      await act(async () => {await jest.advanceTimersByTimeAsync(3_000);}); await flush();
      expect(harness.current.ordersError).toBeNull();
      await act(async () => {
        if (outcome === 'failure') rejectOld(new Error('Нет связи с 1С'));
        else resolveOld({...page, meta: {...page.meta, liveSource: {status: 'pending', message: 'Проверяем документы в 1С'}}});
        await foreground;
      });
      expect(harness.current.ordersError).toBeNull();
      expect(harness.current.orders[0].status).toBe('SHIPPING_IN_PROGRESS');
      expect(harness.current.orders[0].readState?.verificationRequired).toBe(false);
    } finally {await act(async () => harness.renderer.unmount());}
  });

  it('does not clear an explicit action failure on background read recovery', async () => {
    const page = {items: [queuedOrder(0, {status: 'CONFIRMED', syncState: 'SYNCED'})], meta: {total: 1, limit: 20, offset: 0, liveSource: {status: 'ok'}}};
    jest.mocked(getClientOrders).mockResolvedValue(page as any);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => {await jest.advanceTimersByTimeAsync(150);});
      await act(async () => {harness.current.setOrdersError(ONEC_CONNECTION_UNAVAILABLE_MESSAGE);});
      await act(async () => {await jest.advanceTimersByTimeAsync(3_000);}); await flush();
      expect(harness.current.ordersError).toBe(ONEC_CONNECTION_UNAVAILABLE_MESSAGE);
    } finally {await act(async () => harness.renderer.unmount());}
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
      expect(harness.current.ordersError).toBe(SERVER_CONNECTION_UNAVAILABLE_MESSAGE);
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
    jest.mocked(readOfflineDrafts).mockImplementation(async (_userId, ids) =>
      [...records.values()].filter(entry => !ids || ids.includes(entry.clientOrderId)));
    jest.mocked(readOfflineDraftStamps).mockImplementation(async () => [...records.values()]);
    jest.mocked(applyOfflineDraftChanges).mockImplementation(async (_userId, upserts, removals = []) => {
      for (const entry of upserts) records.set(entry.clientOrderId, JSON.parse(JSON.stringify(entry)));
      for (const entry of removals) if (records.get(entry.clientOrderId)?.clientRevision === entry.clientRevision) records.delete(entry.clientOrderId);
      return true;
    });
    return records;
  }

  it('reconciles a change in sending capability without reloading ordinary drafts', async () => {
    const { emitOrderOutboxChange } = require('../src/features/clientOrders/offline/orderOutboxEvents');
    const outbox = jest.requireMock('../src/features/clientOrders/offline/orderOutbox');
    const ordinary = localEntry('ordinary'), sending = localEntry('sending', 'SENDING');
    memoryDraftStore([ordinary, sending]);
    const harness = await ordersListWorkspace();
    try {
      for (const enabled of [true, false]) {
        jest.mocked(readOfflineDrafts).mockClear();
        outbox.isAsyncOrderOutboxEnabled.mockReturnValue(enabled);
        await act(async () => {
          emitOrderOutboxChange({ userId: '1', capabilityChanged: true });
          await jest.advanceTimersByTimeAsync(50);
        });
        expect(readOfflineDrafts).toHaveBeenCalledTimes(1);
        expect(readOfflineDrafts).toHaveBeenCalledWith('1', [sending.clientOrderId]);
        expect(harness.current.orders.find(order => order.guid === sending.order.guid)?.offlineDraftStatus)
          .toBe(enabled ? 'SENDING' : 'SEND_ERROR');
      }
    } finally {
      await act(async () => harness.renderer.unmount());
    }
  });

  it('reads only notified draft IDs during edits and observes cross-runtime changes via stamps', async () => {
    const { emitOrderOutboxChange } = require('../src/features/clientOrders/offline/orderOutboxEvents');
    const a = localEntry('first-target'), b = localEntry('second-target');
    const records = memoryDraftStore([a, b]);
    const harness = await ordersListWorkspace();
    try {
      jest.mocked(readOfflineDrafts).mockClear();
      records.set(a.clientOrderId, { ...a, clientRevision: 3 });
      await act(async () => {
        emitOrderOutboxChange({ userId: '2', draftIds: [b.clientOrderId] });
        emitOrderOutboxChange({ userId: '1', draftIds: [a.clientOrderId] });
        emitOrderOutboxChange({ userId: '1', draftIds: [a.clientOrderId] });
        await jest.advanceTimersByTimeAsync(50);
      });
      expect(readOfflineDrafts).toHaveBeenCalledTimes(1);
      expect(readOfflineDrafts).toHaveBeenCalledWith('1', [a.clientOrderId]);
      jest.mocked(readOfflineDrafts).mockClear();
      records.delete(b.clientOrderId);
      await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });
      expect(readOfflineDrafts).toHaveBeenCalledWith('1', [b.clientOrderId]);
      expect(jest.mocked(readOfflineDrafts).mock.calls.every(call => call[1]?.length === 1)).toBe(true);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('persists an editor autosave once and still reloads another writer’s revision', async () => {
    const entry = localEntry('autosaved');
    const records = memoryDraftStore([entry]);
    const { emitOrderOutboxChange } = require('../src/features/clientOrders/offline/orderOutboxEvents');
    const write = jest.mocked(applyOfflineDraftChanges).getMockImplementation()!;
    jest.mocked(applyOfflineDraftChanges).mockImplementation(async (userId, upserts, removals, writer) => {
      const result = await write(userId, upserts, removals);
      emitOrderOutboxChange({ userId, draftIds: upserts.map(row => row.clientOrderId), writer });
      return result;
    });
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      jest.mocked(readOfflineDrafts).mockClear();
      await act(async () => { harness.current.setItemPatch(harness.current.draft.items[0].key, { quantity: '7' }); });
      await act(async () => { await jest.advanceTimersByTimeAsync(1500); });
      expect(records.get(entry.clientOrderId).payload.items[0].quantity).toBe(7);
      expect(readOfflineDrafts).not.toHaveBeenCalled();

      await act(async () => {
        emitOrderOutboxChange({ userId: '1', draftIds: [entry.clientOrderId], writer: Symbol() });
        await jest.advanceTimersByTimeAsync(50);
      });
      expect(readOfflineDrafts).toHaveBeenCalledWith('1', [entry.clientOrderId]);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('ignores a repeated line input commit and keeps its draft revision and item array stable', async () => {
    const entry = localEntry('repeat-quantity');
    const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      const items = harness.current.draft.items;
      const line = items[0];
      await act(async () => {
        harness.current.setItemPatch(line.key, {quantity: line.quantity});
        harness.current.setItemPatch('removed-line', {quantity: '4'});
      });
      expect(harness.current.draft.items).toBe(items);
      expect(harness.current.dirty).toBe(false);
      await act(async () => { await jest.advanceTimersByTimeAsync(450); });
      expect(records.get(entry.clientOrderId).clientRevision).toBe(1);
    } finally {
      await act(async () => harness.renderer.unmount());
    }
  });

  it.each([true, false])('recovers the displayed item when the orders error boundary replaces the editor before autosave (online=%s)', async online => {
    if (!online) setServerUnavailable('Network request failed');
    const entry = localEntry('boundary-recovery', 'ON_DEVICE', true);
    const records = memoryDraftStore([entry]);
    let current!: ReturnType<typeof useClientOrdersWorkspace>;
    let triggerError!: () => void;
    function Editor() {
      useOrderLoopStage('line-editor');
      current = useClientOrdersWorkspace();
      const [fail, setFail] = React.useState(false);
      const [, setCount] = React.useState(0);
      triggerError = () => setFail(true);
      React.useLayoutEffect(() => { if (fail) setCount(n => n + 1); });
      return null;
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    const observed = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await act(async () => {
        renderer = TestRenderer.create(React.createElement(AuthContext.Provider, {
          value: { isAuthenticated: true, profile: { id: 1 } } as any,
        }, React.createElement(ClientOrdersErrorBoundary, {onExit: jest.fn(), children: React.createElement(Editor)})));
      });
      await act(async () => { await current.selectOrder(entry.order.guid); });
      await act(async () => { current.addDraftItem(localEntry('item').order.localDraft.items[0]); });
      expect(current.draft.items).toHaveLength(1);
      await act(async () => { await jest.advanceTimersByTimeAsync(399); triggerError(); });
      const boundary = renderer.root.findByType(ClientOrdersErrorBoundary);
      expect((boundary.instance as ClientOrdersErrorBoundary).state.error?.message).toMatch(/maximum update depth/i);
      expect(captureException).toHaveBeenCalledWith(expect.any(Error), expect.anything(), {
        screen: 'orders', stage: 'line-editor', componentStack: expect.stringContaining('Editor'),
      });
      expect(records.get(entry.clientOrderId).order.localDraft.items[0].productGuid).toBe('product-guid');
      expect(records.get(entry.clientOrderId).intent).toBe('SAVE');
      expect(records.get(entry.clientOrderId).clientRevision).toBe(2);
      const buttons = renderer.root.findAll(node => String(node.type) === 'Pressable');
      const diagnostics = buttons.find(node => node.props.accessibilityState?.expanded === false);
      await act(async () => { diagnostics!.props.onPress(); });
      expect(renderer.root.findAll(node => node.props.selectable && typeof node.props.children === 'string')
        .some(node => node.props.children.includes('Editor') && !node.props.children.includes(__dirname))).toBe(true);
      const retry = buttons[0];
      await act(async () => { retry.props.onPress(); });
      await act(async () => { await current.selectOrder(entry.order.guid); });
      expect(current.draft.items[0].productGuid).toBe('product-guid');
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      expect(submitClientOrder).not.toHaveBeenCalled();
    } finally {
      if (renderer) await act(async () => renderer.unmount());
      observed.mockRestore();
    }
  });

  it('backs up incomplete local drafts online without submitting or removing them', async () => {
    const records = memoryDraftStore([localEntry('incomplete-backup', 'ON_DEVICE', true)]);
    const harness = await ordersListWorkspace();
    await act(async () => { await jest.advanceTimersByTimeAsync(1600); });
    expect(backupClientOrderDraft).toHaveBeenCalledWith('incomplete-backup', 1, expect.any(Object), expect.any(Object));
    expect(records.get('incomplete-backup').intent).toBe('SAVE');
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(31_000); });
    expect(backupClientOrderDraft).toHaveBeenCalledTimes(1);
    await act(async () => harness.renderer.unmount());
  });

  it('retains shortage details across remount and highlights the exact affected lines', async () => {
    const entry = localEntry('short-stock', 'READY_TO_SEND');
    entry.order.warehouse = { guid: 'warehouse-guid', name: 'Склад' };
    const records = memoryDraftStore([entry]);
    jest.mocked(putClientOrderByClientId).mockRejectedValue(Object.assign(new Error('Недостаточно остатка'), {
      status: 422, backendErrorCode: 'STOCK_SHORTAGE',
      errorDetails: { serverGuid: 'api-draft', draftSaved: true, items: [{ productGuid: 'product-guid', required: 2, available: 1 }] },
    }));
    const first = await ordersListWorkspace();
    await act(async () => { await first.current.syncDeviceDrafts({ force: true }); });
    expect(first.current.ordersError).toContain('Недостаточно остатка');
    expect(records.get('short-stock').status).toBe('NEEDS_EDIT');
    expect(records.get('short-stock').order.draftReview.details.items[0].available).toBe(1);
    await act(async () => first.renderer.unmount());
    const reopened = await ordersListWorkspace();
    await act(async () => { await reopened.current.selectOrder(entry.order.guid); });
    expect(reopened.current.validation.itemMessages.line.join(' ')).toContain('доступно 1');
    expect(reopened.current.error).toContain('Черновик сохранён');
    await act(async () => reopened.renderer.unmount());
  });

  it('recovers connectivity inside the editor without resetting entered data or submitting', async () => {
    memoryDraftStore([localEntry('editor-offline')]);
    setServerUnavailable('Network request failed');
    const harness = await ordersListWorkspace(1, 'editor');
    await act(async () => { await harness.current.selectOrder('device-order-editor-offline'); });
    await act(async () => { harness.current.patchDraft({ comment: 'Не потерять' }); });
    jest.mocked(probeClientOrdersConnection).mockImplementation(async () => { setServerReachable(); return true; });
    await act(async () => { await jest.advanceTimersByTimeAsync(3100); });
    expect(probeClientOrdersConnection).toHaveBeenCalled();
    expect(harness.current.online).toBe(true);
    expect(harness.current.draft.comment).toBe('Не потерять');
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

  it.each(['SEND_ERROR', 'NEEDS_EDIT', 'PRICE_REVIEW'])('reconciles a %s submission accepted on the server without sending it again', async status => {
    const entry = localEntry('response-lost', status);
    const records = memoryDraftStore([entry]);
    setServerUnavailable('Network request failed');
    const harness = await ordersListWorkspace();
    jest.mocked(getClientOrderByClientId).mockResolvedValue(queuedOrder(1, {
      guid: 'api-accepted', clientOrderId: entry.clientOrderId, clientRevision: entry.clientRevision,
    }) as any);
    await act(async () => { setServerReachable(); });
    await flush();
    expect(records.size).toBe(0);
    expect(harness.current.orders.some(order => order.guid === 'api-accepted')).toBe(true);
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

  it.each([[1, false], [1, true], [3, false], [3, true]])('reconciles identical accepted input across counters (local=%s, changed=%s)', async (localRevision, changed) => {
    const entry = localEntry('posted-local-counter', 'NEEDS_EDIT');
    entry.clientRevision = Number(localRevision);
    const acceptedPayload = JSON.parse(JSON.stringify(entry.payload));
    if (changed) entry.payload.items[0].quantity = 7;
    const records = memoryDraftStore([entry]);
    setServerUnavailable('Network request failed');
    const harness = await ordersListWorkspace();
    jest.mocked(getClientOrderByClientId).mockResolvedValue(queuedOrder(0, {
      guid: 'posted-guid', clientOrderId: entry.clientOrderId, clientRevision: 2, origin: 'local',
      syncState: 'SYNCED', status: 'CONFIRMED', createdByUser: { id: 1 }, isPostedIn1c: true,
      number1c: 'НОУТ-123876', last1cError: null, lastExportError: null,
      acceptedClientOperation: { clientRevision: 2, intent: 'SUBMIT', payload: acceptedPayload },
    }) as any);
    await act(async () => { setServerReachable(); });
    await flush();
    expect(records.size).toBe(changed ? 1 : 0);
    if (!changed) expect(harness.current.orders.some(order => order.number1c === 'НОУТ-123876')).toBe(true);
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    expect(submitClientOrder).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

  it('rechecks a stale price error after 1C posts it later, without requiring a local edit or reconnect', async () => {
    const entry = localEntry('batalov-price-review', 'PRICE_REVIEW');
    entry.clientRevision = 2;
    const acceptedPayload = JSON.parse(JSON.stringify(entry.payload));
    const records = memoryDraftStore([entry]);
    let posted = false;
    jest.mocked(getClientOrderByClientId).mockImplementation(async () => queuedOrder(0, {
      guid: 'api-accepted', clientOrderId: entry.clientOrderId, clientRevision: 3, origin: 'local',
      createdByUser: { id: 1 }, syncState: 'SYNCED', status: posted ? 'CONFIRMED' : 'SENT_TO_1C',
      number1c: 'НОУТ-127336', isPostedIn1c: posted, lastExportError: null, last1cError: null,
      acceptedClientOperation: posted ? { clientRevision: 3, intent: 'SUBMIT', payload: acceptedPayload } : null,
    }) as any);
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      expect(records.size).toBe(1);
      expect(getClientOrderByClientId).toHaveBeenCalledTimes(1);
      posted = true;
      await act(async () => { await jest.advanceTimersByTimeAsync(65_000); });
      expect(records.size).toBe(0);
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  function postedAcceptance(entry: any) {
    return queuedOrder(0, {
      guid: 'api-accepted', clientOrderId: entry.clientOrderId, clientRevision: 3, origin: 'local',
      createdByUser: { id: 1 }, syncState: 'SYNCED', status: 'CONFIRMED', isPostedIn1c: true,
      number1c: 'НОУТ-127336', lastExportError: null, last1cError: null,
      readOnly: true, readOnlyReason: 'По заказу создана проведенная реализация товаров и услуг.',
      // Actual 1C quantities may differ after the operator weighs the goods.
      items: [{ product: { guid: 'product-guid' }, quantity: 9, price: 100, amount: 900 }],
      acceptedClientOperation: { clientRevision: 3, intent: 'SUBMIT', payload: JSON.parse(JSON.stringify(entry.payload)) },
    });
  }

  it.each(['editor', 'list', 'bulk', 'scoped'] as const)
  ('reconciles before a manual %s retry, without a price prompt or overwriting later 1C quantities', async action => {
    const entry = priceEntry('already-accepted');
    entry.clientRevision = 2;
    const records = memoryDraftStore([entry, localEntry('untouched-save')]);
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      if (action === 'editor') await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      jest.mocked(getClientOrderByClientId).mockResolvedValue(postedAcceptance(entry) as any);
      await act(async () => {
        if (action === 'editor') await harness.current.submitOrder();
        else if (action === 'list') await harness.current.submitOrderFromList(entry.order);
        else await harness.current.syncDeviceDrafts({ force: true,
          ...(action === 'scoped' ? { orderGuid: entry.order.guid } : {}) });
      });
      expect([...records.keys()]).toEqual(['untouched-save']);
      expect(harness.current.orders.find(order => order.guid === 'api-accepted')?.items?.[0].quantity).toBe(9);
      expect(jest.requireMock('react-native').Alert.alert).not.toHaveBeenCalled();
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      expect(submitClientOrder).not.toHaveBeenCalled();
      expect(updateClientOrder).not.toHaveBeenCalled();
      expect(previewClientOrderAmendment).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('finishes a reconciliation across a harmless local metadata refresh and shares its read with manual retry', async () => {
    const { emitOrderOutboxChange } = require('../src/features/clientOrders/offline/orderOutboxEvents');
    const entry = priceEntry('slow-acceptance');
    entry.clientRevision = 2;
    const accepted = postedAcceptance(entry);
    const records = memoryDraftStore([entry]);
    let finish!: (value: any) => void;
    jest.mocked(getClientOrderByClientId).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      records.set(entry.clientOrderId, { ...entry, updatedAt: '2026-10-21T09:00:00Z' });
      await act(async () => { emitOrderOutboxChange({ userId: '1' }); await jest.advanceTimersByTimeAsync(50); });
      let retry!: Promise<any>;
      await act(async () => { retry = harness.current.submitOrderFromList(entry.order); });
      expect(getClientOrderByClientId).toHaveBeenCalledTimes(1);
      await act(async () => { finish(accepted); await retry; });
      expect(records.size).toBe(0);
      expect(jest.requireMock('react-native').Alert.alert).not.toHaveBeenCalled();
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it.each(['new-operation', 'new-price', 'new-price-choice', 'dirty-editor', 'unmount'] as const)
  ('keeps local input when an old reconciliation finishes after %s', async change => {
    const { emitOrderOutboxChange } = require('../src/features/clientOrders/offline/orderOutboxEvents');
    const entry = priceEntry('late-acceptance');
    entry.clientRevision = 2;
    const accepted = postedAcceptance(entry);
    const records = memoryDraftStore([entry]);
    let finish!: (value: any) => void;
    jest.mocked(getClientOrderByClientId).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      if (change === 'unmount') await act(async () => harness.renderer.unmount());
      else if (change === 'dirty-editor') {
        await act(async () => { await harness.current.selectOrder(entry.order.guid); });
        await act(async () => { harness.current.patchDraft({ comment: 'New unsaved input' }); });
      } else {
        records.set(entry.clientOrderId, { ...entry, clientRevision: 4,
          payload: change === 'new-price' ? { ...entry.payload,
            items: entry.payload.items.map(item => ({ ...item, basePrice: 120 })) }
            : change === 'new-price-choice' ? { ...entry.payload, offlineReview: { pricePolicy: 'USE_CURRENT' } }
              : { ...entry.payload, comment: 'New submitted input' } });
        await act(async () => { emitOrderOutboxChange({ userId: '1' }); await jest.advanceTimersByTimeAsync(50); });
      }
      await act(async () => { finish(accepted); });
      expect(records.size).toBe(1);
      if (change === 'new-operation') expect(records.get(entry.clientOrderId)?.payload.comment).toBe('New submitted input');
      if (change === 'new-price') expect(records.get(entry.clientOrderId)?.payload.items[0].basePrice).toBe(120);
      if (change === 'new-price-choice') expect(records.get(entry.clientOrderId)?.payload.offlineReview.pricePolicy).toBe('USE_CURRENT');
      if (change === 'dirty-editor') {
        expect(harness.current.dirty).toBe(true);
        expect(harness.current.draft.comment).toBe('New unsaved input');
      }
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { if (change !== 'unmount') await act(async () => harness.renderer.unmount()); }
  });

  it('does not poll stale errors in the background and removes its timer on unmount', async () => {
    const entry = priceEntry('background-recheck');
    const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      expect(getClientOrderByClientId).toHaveBeenCalledTimes(1);
      AppState.currentState = 'background';
      await act(async () => { await jest.advanceTimersByTimeAsync(65_000); });
      expect(getClientOrderByClientId).toHaveBeenCalledTimes(1);
      expect(records.size).toBe(1);
    } finally { AppState.currentState = 'active'; await act(async () => harness.renderer.unmount()); }
    await act(async () => { await jest.advanceTimersByTimeAsync(65_000); });
    expect(getClientOrderByClientId).toHaveBeenCalledTimes(1);
  });

  it.each(['SEND_ERROR', 'NEEDS_EDIT', 'PRICE_REVIEW'])('does not consume %s merely because the API has a saved draft', async status => {
    const entry = localEntry('saved-not-sent', status);
    const records = memoryDraftStore([entry]);
    jest.mocked(getClientOrderByClientId).mockResolvedValue(queuedOrder(0, {
      clientOrderId: entry.clientOrderId, clientRevision: entry.clientRevision, syncState: 'DRAFT', status: 'DRAFT',
    }) as any);
    const harness = await ordersListWorkspace();
    await flush();
    expect(records.size).toBe(1);
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

  it.each([0, 2])('does not discard a rejected draft when the accepted server revision differs (%s)', async revision => {
    const entry = localEntry('review-not-accepted', 'NEEDS_EDIT');
    const records = memoryDraftStore([entry]);
    jest.mocked(getClientOrderByClientId).mockResolvedValue(queuedOrder(0, {
      clientOrderId: entry.clientOrderId, clientRevision: revision, syncState: 'SYNCED',
    }) as any);
    const harness = await ordersListWorkspace();
    await flush();
    expect(records.size).toBe(1);
    expect(putClientOrderByClientId).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

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

  function priceEntry(id = 'price-review') {
    const entry: any = localEntry(id, 'PRICE_REVIEW');
    entry.order.offlineDraftStatus = 'PRICE_REVIEW';
    entry.order.draftReview = { code: 'PRICE_REVIEW_REQUIRED', details: { items: [
      { productGuid: 'product-guid', lineGuid: 'line', oldPrice: 100, currentPrice: 120 },
    ] } };
    return entry;
  }

  it.each([['NEEDS_EDIT', 0], ['PRICE_REVIEW', 0], ['NEEDS_EDIT', 4]])
  ('rechecks an unchanged rejected %s above the accepted client revision %s', async (status, acceptedRevision) => {
    const outbox = jest.requireMock('../src/features/clientOrders/offline/orderOutbox');
    outbox.isAsyncOrderOutboxEnabled.mockReturnValue(true);
    const entry: any = localEntry('unchanged-amendment', String(status));
    entry.order.submissionErrorDetails = { backendErrorCode: 'ORDER_CONTENT_CONFLICT' };
    entry.order.submittedVersion = { orderGuid: 'server-order', number1c: 'НОУТ-TEST', clientRevision: Number(acceptedRevision),
      status: 'CONFIRMED', syncState: 'SYNCED', isPostedIn1c: true, revision: 3, itemsCount: 1, totalAmount: 200 };
    const records = memoryDraftStore([entry]);
    const original = JSON.stringify(entry);
    const review: any = { orderGuid: 'server-order', serverRevision: 3, number1c: 'НОУТ-TEST',
      baseContentToken: 'a'.repeat(64), requiresConfirmation: true,
      changes: [{ productName: 'Товар', reason: 'Количество', before: 1, after: 2 }] };
    jest.mocked(previewClientOrderAmendment).mockImplementation(async () => {
      expect(records.get(entry.id).intent).toBe('SAVE');
      return review;
    });
    jest.requireMock('react-native').Alert.alert.mockImplementation((_title: string, _message: unknown, buttons: any[]) => buttons[1].onPress());
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      expect(harness.current.dirty).toBe(false);
      expect(harness.current.canSubmitOrder).toBe(true);
      await act(async () => { await harness.current.submitOrder(); });
      const revision = Math.max(1, Number(acceptedRevision)) + 1;
      expect(previewClientOrderAmendment).toHaveBeenCalledWith(entry.clientOrderId, expect.objectContaining({ clientRevision: revision }));
      expect(jest.requireMock('react-native').Alert.alert).toHaveBeenCalledTimes(1);
      expect(records.get(entry.id)).toMatchObject({ clientRevision: revision, intent: 'SUBMIT', status: 'READY_TO_SEND',
        payload: { integrity: { baseContentToken: review.baseContentToken } } });
      expect(JSON.stringify(entry)).toBe(original);
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it.each(['cancel', 'offline', 'invalid-preview'])('keeps a rejected amendment unqueued when review stops: %s', async outcome => {
    jest.requireMock('../src/features/clientOrders/offline/orderOutbox').isAsyncOrderOutboxEnabled.mockReturnValue(true);
    const entry: any = localEntry('review-stops', 'NEEDS_EDIT');
    entry.order.submissionErrorDetails = { backendErrorCode: 'ORDER_CONTENT_CONFLICT' };
    const records = memoryDraftStore([entry]);
    jest.mocked(previewClientOrderAmendment).mockResolvedValue({ orderGuid: 'server-order', serverRevision: 3,
      number1c: 'НОУТ-TEST', baseContentToken: outcome === 'invalid-preview' ? '' : 'a'.repeat(64),
      requiresConfirmation: true, changes: [] });
    jest.requireMock('react-native').Alert.alert.mockImplementation((_title: string, _message: unknown, buttons: any[]) => buttons[0].onPress());
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      if (outcome === 'offline') await act(async () => { setServerUnavailable('Network request failed'); });
      await act(async () => { await harness.current.submitOrder(); });
      expect(records.get(entry.id)).toMatchObject({ clientRevision: 2, intent: 'SAVE', status: 'ON_DEVICE' });
      expect(records.get(entry.id).payload.items).toEqual(entry.payload.items);
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      if (outcome === 'offline') expect(previewClientOrderAmendment).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('wakes a transport failure without replacing its frozen operation', async () => {
    const outbox = jest.requireMock('../src/features/clientOrders/offline/orderOutbox');
    outbox.isAsyncOrderOutboxEnabled.mockReturnValue(true);
    const entry = localEntry('lost-ack', 'SEND_ERROR'), records = memoryDraftStore([entry]);
    const original = JSON.stringify(entry);
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      await act(async () => { await harness.current.submitOrder(); });
      expect(outbox.retryOrderOutboxNow).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(records.get(entry.id))).toBe(original);
      expect(previewClientOrderAmendment).not.toHaveBeenCalled();
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it.each([false, true])('persists either explicit price choice before retry through the outbox (async=%s)', async asyncOutbox => {
    const outbox = jest.requireMock('../src/features/clientOrders/offline/orderOutbox');
    outbox.isAsyncOrderOutboxEnabled.mockReturnValue(asyncOutbox);
    for (const [button, policy] of ['USE_CURRENT', 'KEEP_DRAFT'].entries()) {
      const entry = priceEntry(); const records = memoryDraftStore([entry, localEntry('untouched')]);
      const frozen = JSON.stringify(entry.payload);
      jest.requireMock('react-native').Alert.alert.mockImplementation((title: string, message: unknown, buttons: any[]) => {
        expect(title).toBe('Обновить цены?'); expect(message).toBeUndefined();
        expect(buttons.map(b => b.text)).toEqual(['Обновить', 'Не изменять', 'Назад']);
        buttons[button].onPress();
      });
      jest.mocked(putClientOrderByClientId).mockResolvedValue(queuedOrder(1, { clientOrderId: entry.clientOrderId }) as any);
      const harness = await ordersListWorkspace();
      try {
        await act(async () => { await harness.current.syncDeviceDrafts({ force: true, orderGuid: entry.order.guid }); });
        if (asyncOutbox) {
          expect(records.get(entry.id)).toMatchObject({ clientRevision: 2, status: 'READY_TO_SEND',
            payload: { offlineReview: { pricePolicy: policy } } });
          expect(outbox.retryOrderOutboxNow).toHaveBeenCalled();
        } else {
          expect(putClientOrderByClientId).toHaveBeenLastCalledWith(entry.clientOrderId, expect.anything(),
            expect.objectContaining({ clientRevision: 2, offlineReview: { pricePolicy: policy } }));
        }
        expect(records.get('untouched').intent).toBe('SAVE');
        expect(JSON.stringify(entry.payload)).toBe(frozen);
      } finally { await act(async () => harness.renderer.unmount()); }
    }
  });

  it.each([['editor', false], ['list', false], ['editor', true], ['list', true]] as const)
  ('asks on retry from %s without requiring edits first (async=%s)', async (action, asyncOutbox) => {
    jest.requireMock('../src/features/clientOrders/offline/orderOutbox').isAsyncOrderOutboxEnabled.mockReturnValue(asyncOutbox);
    const entry = priceEntry(); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    jest.requireMock('react-native').Alert.alert.mockImplementation((_title: string, _message: unknown, buttons: any[]) => buttons[1].onPress());
    try {
      if (action === 'editor') {
        await act(async () => { await harness.current.selectOrder(entry.order.guid); });
        expect(harness.current.validation.itemMessages.line).toEqual(['Цена изменилась: 100 ₽ → 120 ₽']);
        expect(harness.current.canSubmitOrder).toBe(true);
        await act(async () => { await harness.current.submitOrder(); });
      } else {
        await act(async () => { await harness.current.submitOrderFromList(entry.order); });
      }
      expect(jest.requireMock('react-native').Alert.alert).toHaveBeenCalledTimes(1);
      expect(records.get(entry.id)).toMatchObject({ status: 'READY_TO_SEND', clientRevision: 2,
        payload: { offlineReview: { pricePolicy: 'KEEP_DRAFT' } } });
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('leaves the frozen price-review packet intact when the question is dismissed', async () => {
    const entry = priceEntry(); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    const before = JSON.stringify([...records.values()]);
    jest.requireMock('react-native').Alert.alert.mockImplementation((_title: string, _message: unknown, _buttons: any[], options: any) => options.onDismiss());
    try {
      await act(async () => { await harness.current.syncDeviceDrafts({ force: true, orderGuid: entry.order.guid }); });
      expect(JSON.stringify([...records.values()])).toBe(before);
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('asks once for a bulk retry and cannot requeue the same price decision twice', async () => {
    const outbox = jest.requireMock('../src/features/clientOrders/offline/orderOutbox');
    outbox.isAsyncOrderOutboxEnabled.mockReturnValue(true);
    const ordinary = localEntry('ordinary');
    const records = memoryDraftStore([priceEntry('first-price'), priceEntry('second-price'), ordinary]);
    const harness = await ordersListWorkspace();
    jest.requireMock('react-native').Alert.alert.mockImplementation((_title: string, _message: unknown, buttons: any[]) => buttons[0].onPress());
    try {
      await act(async () => { await Promise.all([harness.current.syncDeviceDrafts({ force: true }), harness.current.syncDeviceDrafts({ force: true })]); });
      expect(jest.requireMock('react-native').Alert.alert).toHaveBeenCalledTimes(1);
      for (const id of ['first-price', 'second-price']) expect(records.get(id)).toMatchObject({ clientRevision: 2,
        status: 'READY_TO_SEND', payload: { offlineReview: { pricePolicy: 'USE_CURRENT' } } });
      expect(records.get('ordinary')).toEqual(ordinary);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('does not queue stale editor contents if input changes while the price question is open', async () => {
    const entry = priceEntry(); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    let choose!: () => void;
    let sending!: Promise<void>;
    jest.requireMock('react-native').Alert.alert.mockImplementation((_title: string, _message: unknown, buttons: any[]) => { choose = buttons[0].onPress; });
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      await act(async () => { sending = harness.current.submitOrder(); });
      await act(async () => { harness.current.patchDraft({ comment: 'New input' }); });
      await act(async () => { choose(); await sending; });
      expect(records.get(entry.id).clientRevision).toBe(1);
      expect(harness.current.draft.comment).toBe('New input');
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  function legacyFixture(status = 'READY_TO_SEND') {
    const entry: any = localEntry('legacy-server:legacy-guid', status);
    // Historical documents predate the new-order delivery default.
    entry.order.localDraft.deliveryMethod = null;
    entry.payload = buildLocalDraftPayload(entry.order.localDraft);
    entry.serverGuid = 'legacy-guid'; entry.serverRevision = 1; entry.order.guid = 'legacy-guid'; entry.order.revision = 1;
    const saved: any = { ...entry.order, localDraft: undefined, origin: 'local', revision: 2, createdByUser: { id: 1 },
      agreement: { guid: 'agreement-guid' }, contract: { guid: 'contract-guid' }, warehouse: { guid: 'warehouse-guid' },
      deliveryAddress: { guid: 'address-guid' }, deliveryDate: entry.payload.deliveryDate, currency: 'RUB',
      items: [{ lineGuid: 'line', product: { guid: 'product-guid', name: 'Товар' }, quantity: 2, basePrice: 100 }] };
    return { entry, saved };
  }

  it('recovers the old server revision and checkpoints SQLite before explicit legacy submission', async () => {
    const { entry, saved } = legacyFixture(); const records = memoryDraftStore([entry]);
    jest.mocked(getClientOrder).mockResolvedValue(saved);
    jest.mocked(submitClientOrder).mockImplementation(async () => {
      expect(records.get(entry.clientOrderId).serverRevision).toBe(2);
      expect(records.get(entry.clientOrderId).order.localDraft.revision).toBe(2);
      return { ...saved, status: 'QUEUED', syncState: 'QUEUED' };
    });
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await Promise.all([harness.current.syncDeviceDrafts({ force: true }), harness.current.syncDeviceDrafts({ force: true })]); });
      expect(submitClientOrder).toHaveBeenCalledTimes(1);
      expect(submitClientOrder).toHaveBeenCalledWith('legacy-guid', 2, expect.any(Array));
      expect(updateClientOrder).not.toHaveBeenCalled(); expect(createClientOrder).not.toHaveBeenCalled();
      expect(putClientOrderByClientId).not.toHaveBeenCalled(); expect(records.size).toBe(0);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('resumes legacy SUBMIT after remount using the persisted SAVE revision without a second PATCH', async () => {
    const { entry, saved } = legacyFixture(); const records = memoryDraftStore([entry]);
    jest.mocked(getClientOrder).mockResolvedValueOnce({ ...saved, revision: 1, items: [{ ...saved.items[0], quantity: 1 }] }).mockResolvedValue(saved);
    jest.mocked(updateClientOrder).mockResolvedValue(saved);
    jest.mocked(submitClientOrder).mockRejectedValueOnce(Object.assign(new Error('Network request failed'), { status: 0 }))
      .mockResolvedValue({ ...saved, status: 'QUEUED', syncState: 'QUEUED' });
    const first = await ordersListWorkspace();
    await act(async () => { await first.current.syncDeviceDrafts({ force: true }); });
    expect(records.get(entry.clientOrderId).serverRevision).toBe(2);
    expect(records.get(entry.clientOrderId).status).toBe('SEND_ERROR');
    await act(async () => first.renderer.unmount());
    const reopened = await ordersListWorkspace();
    try {
      await flush(); expect(submitClientOrder).toHaveBeenCalledTimes(1);
      await act(async () => { await reopened.current.syncDeviceDrafts({ force: true }); });
      expect(updateClientOrder).toHaveBeenCalledTimes(1);
      expect(submitClientOrder).toHaveBeenCalledTimes(2);
      expect(submitClientOrder).toHaveBeenLastCalledWith('legacy-guid', 2, expect.any(Array));
      expect(records.size).toBe(0);
    } finally { await act(async () => reopened.renderer.unmount()); }
  });

  it('retains differing legacy content instead of overwriting the server revision', async () => {
    const { entry, saved } = legacyFixture(); const records = memoryDraftStore([entry]);
    jest.mocked(getClientOrder).mockResolvedValue({ ...saved, items: [{ ...saved.items[0], quantity: 3 }] });
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.syncDeviceDrafts({ force: true }); });
      expect(records.get(entry.clientOrderId).status).toBe('NEEDS_EDIT');
      expect(records.get(entry.clientOrderId).payload.items[0].quantity).toBe(2);
      expect(harness.current.ordersError).toContain('Сравните версии');
      expect(harness.current.ordersError).not.toContain('в 1С не отправлен');
      expect(updateClientOrder).not.toHaveBeenCalled(); expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('reconciles an already accepted legacy submission on re-entry without sending automatically', async () => {
    const { entry, saved } = legacyFixture('SEND_ERROR'); const records = memoryDraftStore([entry]);
    jest.mocked(getClientOrder).mockResolvedValue({ ...saved, status: 'QUEUED', syncState: 'QUEUED' });
    const harness = await ordersListWorkspace();
    try {
      await flush(); expect(records.size).toBe(0);
      expect(updateClientOrder).not.toHaveBeenCalled(); expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('explicit sharing saves an unchanged local draft to API with SAVE, never SUBMIT', async () => {
    const entry = localEntry('share-draft');
    const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      jest.mocked(putClientOrderByClientId).mockImplementation(async (_id, _payload, operation) => ({ ...entry.order,
        guid: 'api-shared', origin: 'local', localDraft: undefined, createdByUser: { id: 1 }, clientRevision: operation.clientRevision } as any));
      await act(async () => { await harness.current.saveDraft({ reason: 'manual', intent: 'SAVE', serverOnly: true }); });
      expect(putClientOrderByClientId).toHaveBeenCalledWith('share-draft', expect.any(Object), expect.objectContaining({ intent: 'SAVE' }));
      expect(records.size).toBe(0);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  function shareEntry() {
    const entry = localEntry('share-existing');
    entry.order.guid = 'existing-server-guid';
    entry.serverGuid = 'existing-server-guid' as any;
    entry.serverRevision = 1 as any;
    entry.clientRevision = 41;
    entry.order.clientRevision = 41;
    entry.order.localDraft.clientRevision = 41;
    entry.order.localDraft.guid = entry.order.guid;
    entry.order.localDraft.items = Array.from({ length: 30 }, (_, index) => ({
      ...entry.order.localDraft.items[0], key: `line-${index}`, lineGuid: `line-${index}`, productGuid: `product-${index}`,
    }));
    entry.payload = buildLocalDraftPayload(entry.order.localDraft);
    return entry;
  }

  function confirmShare(entry: ReturnType<typeof localEntry>, revision = entry.clientRevision) {
    return { ...entry.order, origin: 'local', localDraft: undefined, clientRevision: revision,
      createdByUser: { id: 1 }, items: entry.payload.items.map(line => ({ ...line, product: { guid: line.productGuid } })) } as any;
  }

  it('publishes all locally saved edits under an ordinary server GUID even when the editor is clean', async () => {
    const entry = shareEntry(); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      expect(harness.current.dirty).toBe(false);
      expect(harness.current.selectedOrder?.origin).toBe('device');
      jest.mocked(putClientOrderByClientId).mockImplementation(async (_id, _payload, operation) => confirmShare(entry, operation.clientRevision));
      await act(async () => { expect(await harness.current.prepareOrderForSharing()).toMatchObject({ guid: entry.order.guid, origin: 'local' }); });
      expect(putClientOrderByClientId).toHaveBeenCalledWith(entry.clientOrderId,
        expect.objectContaining({ items: expect.arrayContaining(entry.payload.items) }), { clientRevision: 42, intent: 'SAVE' });
      expect(jest.mocked(putClientOrderByClientId).mock.calls[0][1].items).toHaveLength(30);
      expect(records.size).toBe(0);
      expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('shares the requested list draft with its complete persisted payload without opening or saving another editor', async () => {
    const entry = shareEntry(); const other = localEntry('unrelated-editor');
    const records = memoryDraftStore([entry, other]);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.selectOrder(other.order.guid); });
      await act(async () => { harness.current.patchDraft({ comment: 'Unrelated unsaved input' }); });
      const before = harness.current.draft;
      jest.mocked(putClientOrderByClientId).mockResolvedValue(confirmShare(entry));
      await act(async () => { expect(await harness.current.prepareOrderForSharing(entry.order.guid)).toMatchObject({ guid: entry.order.guid }); });
      expect(putClientOrderByClientId).toHaveBeenCalledWith(entry.clientOrderId, entry.payload, { clientRevision: 41, intent: 'SAVE' });
      expect(harness.current.selectedGuid).toBe(other.order.guid);
      expect(harness.current.draft).toEqual(before);
      expect(records.has(entry.clientOrderId)).toBe(false);
      expect(records.has(other.clientOrderId)).toBe(true);
      expect(getClientOrder).not.toHaveBeenCalled(); expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it.each([
    ['old revision', { clientRevision: 40 }], ['wrong identity', { clientOrderId: 'another-client' }],
    ['wrong account', { createdByUser: { id: 2 } }], ['wrong GUID', { guid: 'another-server-guid' }],
    ['local fallback', { origin: 'device' }],
  ])('does not consume the local list draft on %s acknowledgement', async (_label, patch) => {
    const entry = shareEntry(); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    try {
      jest.mocked(putClientOrderByClientId).mockResolvedValue({ ...confirmShare(entry), ...patch });
      await act(async () => { await expect(harness.current.prepareOrderForSharing(entry.order.guid)).rejects.toThrow('Сервер не подтвердил'); });
      expect(records.get(entry.clientOrderId)).toEqual(entry);
      expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('keeps a list SAVE for an idempotent retry after a lost response', async () => {
    const entry = shareEntry(); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    try {
      jest.mocked(putClientOrderByClientId).mockRejectedValueOnce(new Error('Network request failed'))
        .mockResolvedValueOnce(confirmShare(entry));
      await act(async () => { await expect(harness.current.prepareOrderForSharing(entry.order.guid)).rejects.toThrow(); });
      expect(records.get(entry.clientOrderId)).toEqual(entry);
      await act(async () => { expect(await harness.current.prepareOrderForSharing(entry.order.guid)).not.toBeNull(); });
      expect(jest.mocked(putClientOrderByClientId).mock.calls.map(call => call[2])).toEqual([
        { clientRevision: 41, intent: 'SAVE' }, { clientRevision: 41, intent: 'SAVE' },
      ]);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('blocks a second share and preserves a newer durable list revision when the older save finishes', async () => {
    const entry = shareEntry(); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    let finish!: (order: any) => void;
    let pending!: Promise<any>;
    try {
      jest.mocked(putClientOrderByClientId).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      await act(async () => { pending = harness.current.prepareOrderForSharing(entry.order.guid); });
      await act(async () => { await expect(harness.current.prepareOrderForSharing(entry.order.guid)).rejects.toThrow('Дождитесь'); });
      const newer = { ...entry, clientRevision: 42, payload: { ...entry.payload, comment: 'newer durable edit' } };
      // Another editor commits before this request's conditional SQLite delete,
      // but its change notification has not reached this mounted list yet.
      records.set(entry.clientOrderId, newer);
      await act(async () => { finish(confirmShare(entry)); expect(await pending).toBeNull(); });
      expect(records.get(entry.clientOrderId)).toEqual(newer);
      expect(putClientOrderByClientId).toHaveBeenCalledTimes(1);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('ignores a list acknowledgement after switching accounts and keeps the first account draft', async () => {
    const entry = shareEntry(); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    let finish!: (order: any) => void;
    let pending!: Promise<any>;
    try {
      jest.mocked(putClientOrderByClientId).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      await act(async () => { pending = harness.current.prepareOrderForSharing(entry.order.guid); });
      await harness.switchUser(2);
      await act(async () => { finish(confirmShare(entry)); await expect(pending).rejects.toThrow('пользователь изменён'); });
      expect(records.get(entry.clientOrderId)).toEqual(entry);
      expect(harness.current.selectedGuid).toBeNull();
      expect(harness.current.saving).toBe(false);
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('preserves input typed in the editor during sharing and does not return the older server version', async () => {
    const entry = shareEntry(); memoryDraftStore([entry]);
    const harness = await ordersListWorkspace(1, 'editor');
    let finish!: (order: any) => void;
    let pending!: Promise<any>;
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      jest.mocked(putClientOrderByClientId).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      await act(async () => { pending = harness.current.prepareOrderForSharing(); });
      await act(async () => { harness.current.patchDraft({ comment: 'typed while sharing' }); });
      await act(async () => { finish(confirmShare(entry, 42)); expect(await pending).toBeNull(); });
      expect(harness.current.draft.comment).toBe('typed while sharing');
      expect(harness.current.dirty).toBe(true);
      expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('does not treat a serverOnly editor timeout as a successful local save', async () => {
    const entry = shareEntry(); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      jest.mocked(putClientOrderByClientId).mockRejectedValue(new Error('Network request failed'));
      await act(async () => { expect(await harness.current.prepareOrderForSharing()).toBeNull(); });
      expect(records.get(entry.clientOrderId).payload.items).toHaveLength(30);
      expect(records.get(entry.clientOrderId).intent).toBe('SAVE');
      expect(harness.current.error).toBeTruthy();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('keeps the staged editor SAVE when the API acknowledges an older client revision', async () => {
    const entry = shareEntry(); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      jest.mocked(putClientOrderByClientId).mockResolvedValue(confirmShare(entry, 41));
      await act(async () => { expect(await harness.current.prepareOrderForSharing()).toBeNull(); });
      expect(records.get(entry.clientOrderId).clientRevision).toBe(42);
      expect(records.get(entry.clientOrderId).payload.items).toHaveLength(30);
      expect(harness.current.error).toContain('Сервер не подтвердил');
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('does not report a successful share when connectivity disappears during durable staging', async () => {
    const entry = shareEntry(); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      const write = jest.mocked(applyOfflineDraftChanges).getMockImplementation()!;
      jest.mocked(applyOfflineDraftChanges).mockImplementation(async (...args) => {
        const result = await write(...args);
        setServerUnavailable('Network request failed');
        return result;
      });
      await act(async () => { expect(await harness.current.prepareOrderForSharing()).toBeNull(); });
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      expect(records.get(entry.clientOrderId).payload.items).toHaveLength(30);
      expect(harness.current.error).toContain('ссылка не создана');
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('rejects empty, offline and queued list targets without saving any document', async () => {
    const entry = localEntry('share-pending', 'READY_TO_SEND'); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await expect(harness.current.prepareOrderForSharing('')).rejects.toThrow('Не выбран'); });
      await act(async () => { await expect(harness.current.prepareOrderForSharing(entry.order.guid)).rejects.toThrow('очеред'); });
      await act(async () => { setServerUnavailable('Network request failed'); });
      await act(async () => { await expect(harness.current.prepareOrderForSharing('server-guid')).rejects.toThrow('подключение'); });
      expect(records.get(entry.clientOrderId)).toEqual(entry);
      expect(putClientOrderByClientId).not.toHaveBeenCalled(); expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('leaves the editor and server untouched when sharing a clean server list entry', async () => {
    const harness = await ordersListWorkspace();
    try {
      const before = harness.current.draft;
      await act(async () => { expect(await harness.current.prepareOrderForSharing('clean-server-guid')).toMatchObject({ guid: 'clean-server-guid' }); });
      expect(harness.current.draft).toEqual(before);
      expect(harness.current.selectedGuid).toBeNull();
      expect(getClientOrder).not.toHaveBeenCalled(); expect(putClientOrderByClientId).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('recovers an already saved legacy list payload without issuing a new save or submit', async () => {
    const { entry, saved } = legacyFixture('ON_DEVICE'); const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace();
    try {
      jest.mocked(getClientOrder).mockResolvedValue(saved);
      await act(async () => { expect(await harness.current.prepareOrderForSharing(entry.order.guid)).toEqual(saved); });
      expect(records.size).toBe(0);
      expect(updateClientOrder).not.toHaveBeenCalled(); expect(submitClientOrder).not.toHaveBeenCalled();
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('sharing never downgrades a queued or ambiguous submission to SAVE', async () => {
    const entry = localEntry('share-queued', 'READY_TO_SEND');
    const records = memoryDraftStore([entry]);
    const harness = await ordersListWorkspace(1, 'editor');
    try {
      await act(async () => { await harness.current.selectOrder(entry.order.guid); });
      await act(async () => { await harness.current.saveDraft({ reason: 'manual', intent: 'SAVE', serverOnly: true }); });
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      expect(records.get('share-queued').intent).toBe('SUBMIT');
      expect(harness.current.error).toContain('очеред');
    } finally { await act(async () => harness.renderer.unmount()); }
  });

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

  it.each([false, true])('autosaves incomplete new input locally once per edit and restores it after remount (online=%s)', async online => {
    const records = memoryDraftStore();
    if (online) setServerReachable();
    else setServerUnavailable('Network request failed');
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
    expect(createClientOrder).not.toHaveBeenCalled();
    expect(updateClientOrder).not.toHaveBeenCalled();
    expect(submitClientOrder).not.toHaveBeenCalled();
    expect([...records.values()][0]).toMatchObject({ intent: 'SAVE', status: 'ON_DEVICE' });
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

  it.each([true, false])('queue confirms a protected order reduction only with user approval (%s)', async accepted => {
    const records = memoryDraftStore([localEntry('review-queued', 'READY_TO_SEND')]);
    const challenge = Object.assign(new Error('Подтвердите уменьшение'), { status: 409,
      errorDetails: { kind: 'ORDER_CHANGE_REVIEW_REQUIRED', baseContentToken: 'server-base',
        confirmationToken: 'signed-review', changes: [{ productName: 'Говядина', reason: 'Уменьшение количества', before: 60, after: 20 }] } });
    jest.mocked(putClientOrderByClientId).mockRejectedValueOnce(challenge).mockImplementationOnce(async (_id, payload, options) => {
      expect(records.get('review-queued').payload.integrity).toEqual(payload.integrity);
      return queuedOrder(1, { guid: 'api-queued', clientOrderId: 'review-queued', clientRevision: options.clientRevision }) as any;
    });
    jest.requireMock('react-native').Alert.alert.mockImplementation((_title: string, message: string, buttons: any[]) => {
      expect(message).toContain('60 → 20');
      buttons.find(button => button.text === (accepted ? 'Подтвердить' : 'Отмена')).onPress();
    });
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.syncDeviceDrafts({ force: true }); });
      const calls = jest.mocked(putClientOrderByClientId).mock.calls;
      expect(calls).toHaveLength(accepted ? 2 : 1);
      if (accepted) {
        expect(calls[1][0]).toBe(calls[0][0]);
        expect(calls[1][2]).toEqual(calls[0][2]);
        expect(calls[1][1].integrity).toEqual({ baseContentToken: 'server-base', confirmationToken: 'signed-review' });
        expect(calls[1][1].geoEvents).toEqual(calls[0][1].geoEvents);
        expect(records.size).toBe(0);
      } else {
        expect(records.get('review-queued').status).toBe('NEEDS_EDIT');
        expect(records.get('review-queued').payload.integrity?.confirmationToken).toBeUndefined();
      }
    } finally { await act(async () => harness.renderer.unmount()); }
  });

  it('queue never treats a content conflict as approval to retry', async () => {
    const records = memoryDraftStore([localEntry('stale-queued', 'READY_TO_SEND')]);
    jest.mocked(putClientOrderByClientId).mockRejectedValue(Object.assign(new Error('Stale'), {
      status: 409, errorDetails: { kind: 'ORDER_CONTENT_CONFLICT' },
    }));
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.syncDeviceDrafts({ force: true }); });
      expect(putClientOrderByClientId).toHaveBeenCalledTimes(1);
      expect(jest.requireMock('react-native').Alert.alert).not.toHaveBeenCalled();
      expect(records.get('stale-queued').status).toBe('NEEDS_EDIT');
    } finally { await act(async () => harness.renderer.unmount()); }
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
    jest.requireMock('react-native').Alert.alert.mockImplementation((_title: string, _message: unknown, buttons: any[]) => buttons[1].onPress());
    expect(harness.current.deviceDraftsCount).toBe(6);
    expect(harness.current.readyDeviceDraftsCount).toBe(3);
    expect(harness.current.queuedDeviceDraftsCount).toBe(4);
    await act(async () => { await harness.current.syncDeviceDrafts({ force: true }); });
    expect(maxInFlight).toBe(1);
    expect(jest.mocked(putClientOrderByClientId).mock.calls.map(call => call[0]).sort()).toEqual(['first', 'review', 'second']);
    expect(records.get('complete')).toEqual(completeDraft);
    expect(records.get('incomplete')).toEqual(incompleteDraft);
    expect(records.get('invalid-queued').status).toBe('NEEDS_EDIT');
    expect(records.has('review')).toBe(false);
    expect(records.size).toBe(3);
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

  it('does not apply an unscoped forced price policy to review documents', async () => {
    const review = localEntry('review', 'PRICE_REVIEW');
    const records = memoryDraftStore([review, localEntry('other-review', 'PRICE_REVIEW')]);
    const harness = await ordersListWorkspace();
    try {
      await act(async () => { await harness.current.syncDeviceDrafts({ force: true, pricePolicy: 'USE_CURRENT' }); });
      expect(putClientOrderByClientId).not.toHaveBeenCalled();
      expect(harness.current.queuedDeviceDraftsCount).toBe(2);
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
    expect(getClientOrderInvoices).toHaveBeenCalledWith('order-guid', expect.objectContaining({signal: expect.any(AbortSignal), expectedUserId: 1}));
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
    {
      name: 'clears an explicit null lock reason without requiring a new status or revision',
      fields: { readOnlyReason: null },
      expected: { readOnly: false, readOnlyReason: null, last1cError: 'Posting failed', lastExportError: 'Export failed' },
    },
  ])('$name on list refresh without reloading the open document', async ({ fields, expected }) => {
    const original = queuedOrder(0, {
      status: 'CONFIRMED',
      syncState: 'SYNCED',
      number1c: 'НОУТ-114718',
      isPostedIn1c: true,
      last1cError: 'Posting failed',
      lastExportError: 'Export failed',
      readOnly: false,
      readOnlyReason: 'Заказ отправляется в API',
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
    }), expect.objectContaining({signal: expect.any(AbortSignal), expectedUserId: 1}));
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
    }), expect.objectContaining({signal: expect.any(AbortSignal), expectedUserId: 1}));
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
  async function auditedReadWorkspace() {
    let active = true;
    let current!: ReturnType<typeof useClientOrdersWorkspace>;
    const Harness = () => {current = useClientOrdersWorkspace({autoSelectLatestDraft: false, confirmDiscard: async () => true, isScreenActive: active}); return null;};
    const render = (userId: number) => React.createElement(AuthContext.Provider, {value: {
      isLoading: false, isAuthenticated: true, profile: {id: userId}, setAuthenticated: jest.fn(), setProfile: jest.fn(), signOut: jest.fn(),
    } as any}, React.createElement(Harness));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {renderer = TestRenderer.create(render(1));}); await flush();
    return {get current() {return current;}, renderer, changeActive: async (value: boolean) => {active=value; await act(async()=>renderer.update(render(1)));}, changeUser: async (userId: number) => {await act(async () => renderer.update(render(userId)));}};
  }

  it('aborts superseded detail reads and a late old selection cannot cancel the new document', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({items: [], meta: {}} as any);
    const harness = await auditedReadWorkspace();
    let finish!: (order: any) => void;
    jest.mocked(getClientOrder).mockReturnValueOnce(new Promise(resolve => {finish = resolve;}))
      .mockResolvedValueOnce(queuedOrder(0, {guid: 'new', status: 'CONFIRMED', syncState: 'SYNCED', readOnly: true}));
    let oldSelection!: Promise<boolean>;
    await act(async () => {oldSelection = harness.current.selectOrder('old');});
    const oldSignal = jest.mocked(getClientOrder).mock.calls[0][1]?.signal;
    await act(async () => {await harness.current.selectOrder('new');});
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {finish(queuedOrder(0, {guid: 'old'})); await oldSelection;});
    expect(harness.current.selectedGuid).toBe('new'); expect(harness.current.loadingDetail).toBe(false);
    expect(getClientOrderInvoices).toHaveBeenCalledWith('new', expect.objectContaining({signal: expect.any(AbortSignal)}));
    expect(jest.mocked(getClientOrderInvoices).mock.calls.some(call => call[0] === 'old')).toBe(false);
    await act(async () => harness.renderer.unmount());
  });

  it('canceling the counterparty aborts slow defaults and prevents restoring the old context', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({items: [], meta: {}} as any);
    const harness = await auditedReadWorkspace();
    let finish!: (defaults: any) => void;
    jest.mocked(getClientOrderDefaults).mockReturnValue(new Promise(resolve => {finish = resolve;}));
    let first!: Promise<void>;
    await act(async () => {first = harness.current.setCounterparty({guid: 'old-client', name: 'Old'} as any);});
    const signal = jest.mocked(getClientOrderDefaults).mock.calls[0][1]?.signal;
    await act(async () => {await harness.current.setCounterparty(null);});
    expect(signal?.aborted).toBe(true);
    await act(async () => {finish({agreement: {guid: 'old-agreement'}, counterparty: {guid: 'old-client'}}); await first;});
    expect(harness.current.draft.counterpartyGuid).toBe(''); expect(harness.current.draft.agreementGuid).toBe('');
    expect(harness.current.loadingDefaults).toBe(false);
    await act(async () => harness.renderer.unmount());
  });

  it('open invoice polling owns its identifier and list metadata changes do not restart the batch', async () => {
    const pending = queuedOrder(0, {guid: 'open', status: 'CONFIRMED', syncState: 'SYNCED', readOnly: true, invoiceState: 'WAITING', invoiceRequestPending: true});
    const other = {...pending, guid: 'other'};
    jest.mocked(getClientOrders).mockResolvedValue({items: [pending, other], meta: {}} as any);
    jest.mocked(getClientOrder).mockResolvedValue(pending);
    const harness = await auditedReadWorkspace();
    await act(async () => {await jest.advanceTimersByTimeAsync(120); await harness.current.selectOrder('open');});
    jest.mocked(getClientOrderInvoiceStatuses).mockClear();
    await act(async () => {await jest.advanceTimersByTimeAsync(5000);});
    expect(getClientOrderInvoiceStatuses).toHaveBeenCalledWith(['other'], expect.objectContaining({expectedUserId: 1}));
    const count = jest.mocked(getClientOrderInvoiceStatuses).mock.calls.length;
    await act(async () => {await harness.current.refreshOrders();});
    expect(getClientOrderInvoiceStatuses).toHaveBeenCalledTimes(count);
    await act(async () => harness.renderer.unmount());
  });

  it('late invoice batch responses from the previous account cannot update current rows', async () => {
    const pending = queuedOrder(0, {status: 'CONFIRMED', syncState: 'SYNCED', invoiceState: 'WAITING', invoiceRequestPending: true});
    jest.mocked(getClientOrders).mockResolvedValue({items: [pending], meta: {}} as any);
    let finish!: (value: any) => void;
    jest.mocked(getClientOrderInvoiceStatuses).mockReturnValueOnce(new Promise(resolve => {finish = resolve;})).mockResolvedValue([]);
    const harness = await auditedReadWorkspace();
    await act(async () => {await jest.advanceTimersByTimeAsync(120);});
    const signal = jest.mocked(getClientOrderInvoiceStatuses).mock.calls[0][1]?.signal;
    await harness.changeUser(2);
    expect(signal?.aborted).toBe(true);
    await act(async () => {finish([{identifier: pending.guid, invoices: [{id: 'revoked', state: 'AVAILABLE', downloadAvailable: true}]}]);});
    expect(harness.current.orders.some(order => order.invoiceState === 'AVAILABLE')).toBe(false);
    await act(async () => harness.renderer.unmount());
  });

  it('manual summary force waits for its own authoritative read after an ordinary snapshot request', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({items: [], meta: {}} as any);
    const snapshot = {date: currentOmskDate(), ordersCount: 1, clientsCount: 1, totalAmount: 100, profit: 20,
      profitAvailable: true, missingReceiptPriceCount: 0, currency: 'RUB', calculatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(), stale: true, refreshPending: true};
    let finish!: (value: any) => void;
    jest.mocked(getClientOrdersTodaySummary).mockReturnValueOnce(new Promise(resolve => {finish = resolve;}))
      .mockResolvedValue({...snapshot, profit: 30, stale: false, refreshPending: false} as any);
    const harness = await auditedReadWorkspace();
    let forced!: ReturnType<typeof harness.current.refreshTodaySummary>;
    await act(async () => {forced = harness.current.refreshTodaySummary({force: true});});
    expect(getClientOrdersTodaySummary).toHaveBeenCalledTimes(1);
    await act(async () => {finish(snapshot); await forced;});
    expect(getClientOrdersTodaySummary).toHaveBeenCalledTimes(2);
    expect(getClientOrdersTodaySummary).toHaveBeenLastCalledWith(expect.objectContaining({force: true, signal: expect.any(AbortSignal), expectedUserId: 1}));
    expect(harness.current.todaySummary).toMatchObject({profit: 30, stale: false, refreshPending: false, fetchedAt: snapshot.fetchedAt});
    await act(async () => harness.renderer.unmount());
  });

  it('a pending cached summary refreshes in the background while preserving its known figures', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({items: [], meta: {}} as any);
    const snapshot = {date: currentOmskDate(), ordersCount: 1, clientsCount: 1, totalAmount: 100, profit: 20,
      profitAvailable: true, missingReceiptPriceCount: 0, currency: 'RUB', calculatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(), stale: true, refreshPending: true};
    jest.mocked(getClientOrdersTodaySummary).mockResolvedValueOnce(snapshot as any)
      .mockResolvedValue({...snapshot, totalAmount: 150, stale: false, refreshPending: false} as any);
    const harness = await auditedReadWorkspace();
    expect(harness.current.todaySummary).toMatchObject({totalAmount: 100, stale: true, refreshPending: true});
    expect(harness.current.loadingTodaySummary).toBe(false);
    await act(async () => {await jest.advanceTimersByTimeAsync(2000);});
    expect(harness.current.todaySummary).toMatchObject({totalAmount: 150, stale: false, refreshPending: false});
    expect(getClientOrdersTodaySummary).toHaveBeenCalledTimes(2);
    expect(harness.current.calculatingTodayProfit).toBe(false);
    await act(async () => harness.renderer.unmount());
  });

  it('profit-only list updates and explicit absence survive stable document status and revision', async () => {
    const order = queuedOrder(0, {status: 'CONFIRMED', syncState: 'SYNCED', profit: null, profitAvailable: false,
      profitFreshness: {source: 'profit-snapshot', status: 'unknown', checkedAt: null, refreshPending: true}});
    jest.mocked(getClientOrders).mockResolvedValue({items: [order], meta: {}} as any);
    const harness = await auditedReadWorkspace();
    await act(async () => {await jest.advanceTimersByTimeAsync(120);});
    jest.mocked(getClientOrders).mockResolvedValue({items: [{...order, profit: 25, profitAvailable: true,
      profitFreshness: {source: 'profit-snapshot', status: 'stale', checkedAt: new Date().toISOString(), refreshPending: true}}], meta: {}} as any);
    await act(async () => {await harness.current.refreshOrders();});
    expect(harness.current.orders[0]).toMatchObject({profit: 25, profitAvailable: true, profitFreshness: {status: 'stale'}});
    jest.mocked(getClientOrders).mockResolvedValue({items: [order], meta: {}} as any);
    await act(async () => {await harness.current.refreshOrders();});
    expect(harness.current.orders[0]).toMatchObject({profit: null, profitAvailable: false});
    expect(submitClientOrder).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

  it('unmount cancels a queued forced summary read before it can start another request', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({items: [], meta: {}} as any);
    let finish!: (value: any) => void;
    jest.mocked(getClientOrdersTodaySummary).mockReturnValueOnce(new Promise(resolve => {finish = resolve;}));
    const harness = await auditedReadWorkspace();
    let forced!: ReturnType<typeof harness.current.refreshTodaySummary>;
    await act(async () => {forced = harness.current.refreshTodaySummary({force: true});});
    const signal = jest.mocked(getClientOrdersTodaySummary).mock.calls[0][0]?.signal;
    await act(async () => harness.renderer.unmount());
    expect(signal?.aborted).toBe(true);
    await act(async () => {finish({}); expect(await forced).toBeNull();});
    expect(getClientOrdersTodaySummary).toHaveBeenCalledTimes(1);
  });

  it('restored offline summary is explicitly stale and never resurrects an old pending refresh', async () => {
    const cached = {date: currentOmskDate(), ordersCount: 2, clientsCount: 1, totalAmount: 100, profit: 0,
      profitAvailable: true, missingReceiptPriceCount: 0, currency: 'RUB', calculatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(), stale: false, refreshPending: true};
    jest.mocked(AsyncStorage.getItem).mockImplementation(async key => key.startsWith('client_orders_today_summary_cache_v1:')
      ? JSON.stringify({date: cached.date, summary: cached}) : null);
    setServerUnavailable('offline');
    const harness = await auditedReadWorkspace();
    expect(harness.current.todaySummary).toMatchObject({totalAmount: 100, profit: 0, stale: true,
      refreshPending: false, fetchedAt: cached.fetchedAt});
    await act(async () => {await jest.advanceTimersByTimeAsync(5000);});
    expect(getClientOrdersTodaySummary).not.toHaveBeenCalled();
    await act(async () => harness.renderer.unmount());
  });

  const pendingRead = {source: 'local' as const, checkedAt: null, stale: true, refreshPending: true, verificationRequired: true};
  const freshRead = {source: 'verified-snapshot' as const, checkedAt: '2026-11-17T12:00:00Z', stale: false, refreshPending: false, verificationRequired: false};

  it('opens a pending detail without inventing an empty order and replaces it when verified', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({items: [], meta: {}} as any);
    const harness = await auditedReadWorkspace();
    jest.mocked(getClientOrder).mockRejectedValueOnce(Object.assign(new Error('pending'), {code: 'CLIENT_ORDER_READ_PENDING', readState: {...pendingRead, source: 'none'}}))
      .mockResolvedValue(queuedOrder(0, {guid: 'pending', status: 'DRAFT', syncState: 'DRAFT', readState: freshRead}));
    await act(async () => {expect(await harness.current.selectOrder('pending')).toBe(true);});
    expect(harness.current.selectedOrder).toBeNull();
    expect(harness.current.pendingDetail?.guid).toBe('pending');
    expect(harness.current.loadingDetail).toBe(false);
    await act(async () => {await jest.advanceTimersByTimeAsync(2000);});
    expect(harness.current.pendingDetail).toBeNull();
    expect(harness.current.selectedOrder?.guid).toBe('pending');
    await act(async () => harness.renderer.unmount());
  });

  it('keeps dirty body, revision and token when background verification discovers realization', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({items: [], meta: {}} as any);
    const harness = await auditedReadWorkspace();
    const original = queuedOrder(0, {guid: 'preview', status: 'DRAFT', syncState: 'DRAFT', revision: 3, contentToken: 'original', readState: pendingRead, comment: 'saved'});
    jest.mocked(getClientOrder).mockResolvedValueOnce(original)
      .mockResolvedValue({...original, revision: 4, contentToken: 'server-new', comment: 'remote', readState: freshRead, hasRealization: true, readOnly: true});
    await act(async () => {await harness.current.selectOrder('preview');});
    expect(harness.current.readOnly).toBe(false);
    await act(async () => {await jest.advanceTimersByTimeAsync(1800);});
    await act(async () => {harness.current.patchDraft({comment: 'my unsaved text'});});
    await act(async () => {await jest.advanceTimersByTimeAsync(200);});
    expect(harness.current.dirty).toBe(true);
    expect(harness.current.draft.comment).toBe('my unsaved text');
    expect(harness.current.draft.revision).toBe(3);
    expect(harness.current.draft.contentToken).toBe('original');
    expect(harness.current.readOnly).toBe(true);
    await act(async () => harness.renderer.unmount());
  });

  it('aborts pending detail verification on account change and stops unknown detail after bounded polls', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({items: [], meta: {}} as any);
    const harness = await auditedReadWorkspace();
    jest.mocked(getClientOrder).mockRejectedValue(Object.assign(new Error('pending'), {code: 'CLIENT_ORDER_READ_PENDING', readState: {...pendingRead, source: 'none'}}));
    await act(async () => {await harness.current.selectOrder('unknown');});
    for (const ms of [2000, 5000, 10000, 30000]) await act(async () => {await jest.advanceTimersByTimeAsync(ms);});
    expect({pending:harness.current.pendingDetail?.readState.refreshPending,calls:jest.mocked(getClientOrder).mock.calls.length}).toEqual({pending:false,calls:5});
    const count = jest.mocked(getClientOrder).mock.calls.length;
    await act(async () => {await jest.advanceTimersByTimeAsync(30000);});
    expect(getClientOrder).toHaveBeenCalledTimes(count);
    await harness.changeUser(2); await flush();
    expect(harness.current.pendingDetail).toBeNull();
    expect(harness.current.selectedOrder).toBeNull();
    expect(harness.current.selectedGuid).toBeNull();
    expect(jest.mocked(getClientOrder).mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
    await act(async () => harness.renderer.unmount());
  });

  it('never clears selected defaults or manual values with a pending context response', async () => {
    const harness = await editableWorkspace();
    await act(async () => {harness.current.patchDraft(prev => ({...prev,agreementGuid: 'chosen', warehouseGuid: 'manual-warehouse',items:prev.items.map(item=>({...item,manualPrice:'123'}))}));});
    jest.mocked(getClientOrderDefaults).mockResolvedValue({pending: true, readState: pendingRead, agreement: null, warehouse: null});
    await act(async () => {await harness.current.setOrganization({guid: 'org-guid', name: 'Org'});});
    expect(harness.current.draft.items[0].manualPrice).toBe('123');
    expect(harness.current.defaultsReadState?.verificationRequired).toBe(true);
    await act(async () => harness.renderer.unmount());
  });


  it('fills local defaults immediately and later fills untouched fields after a comment edit', async () => {
    const harness = await editableWorkspace();
    const local:any = {pending:true,readState:pendingRead,agreement:{guid:'auto-a',name:'Auto'},contract:{guid:'auto-c',name:'Contract'},warehouse:null};
    jest.mocked(getClientOrderDefaults).mockResolvedValueOnce(local).mockResolvedValue({...local,pending:false,readState:freshRead,warehouse:{guid:'auto-w',name:'Warehouse'}});
    await act(async () => {await harness.current.setCounterparty({guid:'customer-new',name:'New'} as any);});
    expect(harness.current.draft.agreementGuid).toBe('auto-a');
    expect(harness.current.selections.agreement?.guid).toBe('auto-a');
    expect(harness.current.defaultsPending).toBe(true);
    await act(async () => {harness.current.patchDraft({comment:'User typed'});});
    await act(async () => {await jest.advanceTimersByTimeAsync(2000);});
    expect(harness.current.draft.warehouseGuid).toBe('auto-w');
    expect(harness.current.draft.comment).toBe('User typed');
    expect(harness.current.defaultsPending).toBe(false);
    await act(async () => harness.renderer.unmount());
  });

  it('keeps an explicitly cleared warehouse through a late defaults response and manual retry', async () => {
    const harness = await editableWorkspace();
    const local:any={pending:true,readState:pendingRead};
    const ready:any={pending:false,readState:freshRead,warehouse:{guid:'auto-w',name:'Warehouse'},contract:{guid:'auto-c',name:'Contract'}};
    jest.mocked(getClientOrderDefaults).mockResolvedValueOnce(local).mockResolvedValue(ready);
    await act(async()=>{await harness.current.setCounterparty({guid:'customer-new',name:'New'} as any);});
    await act(async()=>{harness.current.setWarehouse(null);});
    await act(async()=>{await jest.advanceTimersByTimeAsync(2000);});
    expect(harness.current.draft.warehouseGuid).toBe('');expect(harness.current.draft.contractGuid).toBe('auto-c');
    await act(async()=>{harness.current.retryDefaults();});await flush();
    expect(harness.current.draft.warehouseGuid).toBe('');
    await act(async()=>harness.renderer.unmount());
  });

  it('persists late autofill after the initial local autosave and does not resave identical polls', async () => {
    const records = memoryDraftStore();
    const harness = await editableWorkspace();
    const local:any={pending:true,readState:pendingRead,contract:{guid:'auto-c',name:'Contract'}};
    const ready:any={...local,pending:false,readState:freshRead,warehouse:{guid:'auto-w',name:'Warehouse'}};
    jest.mocked(getClientOrderDefaults).mockResolvedValueOnce(local).mockResolvedValue(ready);
    await act(async()=>{await harness.current.setCounterparty({guid:'customer-new',name:'New'} as any);});
    await act(async()=>{await jest.advanceTimersByTimeAsync(400);});
    expect(harness.current.dirty).toBe(false);
    expect([...records.values()][0].order.localDraft.warehouseGuid).toBe('');
    const oldSave = harness.current.saveDraft;
    await act(async()=>{await jest.advanceTimersByTimeAsync(1600);});
    expect(harness.current.draft.warehouseGuid).toBe('auto-w');
    expect(harness.current.dirty).toBe(true);
    await act(async()=>{expect(await oldSave({reason:'autosave'})).toBeNull();});
    await act(async()=>{await jest.advanceTimersByTimeAsync(400);});
    expect([...records.values()][0].order.localDraft.warehouseGuid).toBe('auto-w');
    const writes = jest.mocked(applyOfflineDraftChanges).mock.calls.length;
    await act(async()=>{harness.current.retryDefaults();}); await flush();
    await act(async()=>{await jest.advanceTimersByTimeAsync(500);});
    expect(jest.mocked(applyOfflineDraftChanges).mock.calls.length).toBe(writes);
    await act(async()=>harness.renderer.unmount());
  });

  it('keeps a manual header price clear and manual item price through late defaults', async () => {
    const harness = await editableWorkspace();
    jest.mocked(getClientOrderDefaults).mockResolvedValueOnce({pending:true,readState:pendingRead})
      .mockResolvedValue({priceType:{guid:'auto-price',name:'Auto'},warehouse:{guid:'auto-w',name:'Warehouse'},readState:freshRead});
    await act(async()=>{await harness.current.setCounterparty({guid:'customer-new',name:'New'} as any);});
    await act(async()=>{harness.current.setHeaderPriceType(null);});
    await act(async()=>{harness.current.patchDraft(prev=>({...prev,items:prev.items.map(item=>({...item,manualPrice:'123'}))}));});
    await act(async()=>{await jest.advanceTimersByTimeAsync(2000);});
    expect(harness.current.draft.priceTypeGuid).toBeNull();
    expect(harness.current.draft.items[0].manualPrice).toBe('123');
    expect(harness.current.draft.warehouseGuid).toBe('auto-w');
    await act(async()=>harness.renderer.unmount());
  });

  it('recovers defaults after a transient failure and a result taking longer than 47 seconds', async () => {
    const harness = await editableWorkspace();
    const started = Date.now();
    jest.mocked(getClientOrderDefaults).mockRejectedValueOnce(new Error('temporarily unavailable')).mockImplementation(async()=>
      Date.now()-started < 60000 ? {pending:true,readState:pendingRead} : {readState:freshRead,warehouse:{guid:'late-w',name:'Late'}});
    await act(async()=>{await harness.current.setCounterparty({guid:'customer-new',name:'New'} as any);});
    await act(async()=>{await jest.advanceTimersByTimeAsync(67000);});
    expect(harness.current.draft.warehouseGuid).toBe('late-w');
    expect(harness.current.defaultsRefreshStatus).toBe('idle');
    await act(async()=>harness.renderer.unmount());
  });

  it('exposes bounded defaults exhaustion and manual retry without unbounded polling', async () => {
    const harness = await editableWorkspace();
    jest.mocked(getClientOrderDefaults).mockClear().mockResolvedValue({pending:true,readState:pendingRead});
    await act(async()=>{await harness.current.setCounterparty({guid:'customer-new',name:'New'} as any);});
    await act(async()=>{await jest.advanceTimersByTimeAsync(112000);});
    expect(getClientOrderDefaults).toHaveBeenCalledTimes(7);
    expect(harness.current.defaultsRefreshStatus).toBe('retry');
    expect(harness.current.defaultsPending).toBe(true);
    await act(async()=>{await jest.advanceTimersByTimeAsync(112000);});
    expect(getClientOrderDefaults).toHaveBeenCalledTimes(7);
    jest.mocked(getClientOrderDefaults).mockResolvedValue({readState:freshRead,warehouse:{guid:'retry-w',name:'Retry'}});
    await act(async()=>{harness.current.retryDefaults();}); await flush();
    expect(harness.current.draft.warehouseGuid).toBe('retry-w');
    expect(harness.current.defaultsPending).toBe(false);
    await act(async()=>harness.renderer.unmount());
  });

  it('pauses defaults on loss of screen focus and recovers on focus and reconnect', async () => {
    const harness = await auditedReadWorkspace();
    jest.mocked(getClientOrderDefaults).mockClear().mockResolvedValue({pending:true,readState:pendingRead});
    await act(async()=>{await harness.current.setCounterparty({guid:'customer-new',name:'New'} as any);});
    const signal = jest.mocked(getClientOrderDefaults).mock.calls.at(-1)?.[1]?.signal;
    await harness.changeActive(false);
    expect(signal?.aborted).toBe(true);
    const count = jest.mocked(getClientOrderDefaults).mock.calls.length;
    await act(async()=>{await jest.advanceTimersByTimeAsync(10000);});
    expect(getClientOrderDefaults).toHaveBeenCalledTimes(count);
    await harness.changeActive(true); await flush();
    expect(getClientOrderDefaults).toHaveBeenCalledTimes(count+1);
    await act(async()=>{setServerUnavailable('Network request failed');});
    jest.mocked(getClientOrderDefaults).mockResolvedValue({readState:freshRead,warehouse:{guid:'reconnected',name:'Ready'}});
    await act(async()=>{setServerReachable();}); await flush();
    expect(harness.current.draft.warehouseGuid).toBe('reconnected');
    expect(harness.current.defaultsPending).toBe(false);
    await act(async()=>harness.renderer.unmount());
  });

  it('rejects old defaults after account change even if the same customer is selected again', async () => {
    const harness = await auditedReadWorkspace();
    let finish!: (value:any)=>void;
    jest.mocked(getClientOrderDefaults).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
    let waiting!: Promise<void>;
    await act(async()=>{waiting=harness.current.setCounterparty({guid:'customer-new',name:'New'} as any);});
    const signal=jest.mocked(getClientOrderDefaults).mock.calls.at(-1)?.[1]?.signal;
    await harness.changeUser(2); await flush();
    expect(signal?.aborted).toBe(true);
    await act(async()=>{finish({warehouse:{guid:'old-account',name:'Old'}});await waiting;});
    expect(harness.current.draft.warehouseGuid).toBe('');
    expect(harness.current.selections.warehouse).toBeNull();
    await act(async()=>harness.renderer.unmount());
  });

  it('advances using the server cursor when a filtered incomplete page contains no rows', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({items: [], meta: {total: 80, limit: 20, offset: 0, nextOffset: 20,
      hasMore: true, incomplete: true, totalIsEstimate: true, readState: {...pendingRead, refreshPending: false}}} as any);
    const harness = await auditedReadWorkspace();
    await act(async () => {await jest.advanceTimersByTimeAsync(200);});
    expect(harness.current.ordersMeta.incomplete).toBe(true);
    jest.mocked(getClientOrders).mockClear().mockResolvedValue({items: [], meta: {total: 80, limit: 20, offset: 20, nextOffset: 40,
      hasMore: true, incomplete: true, totalIsEstimate: true, readState: {...pendingRead, refreshPending: false}}} as any);
    await act(async () => {await harness.current.loadMoreOrders();});
    expect(jest.mocked(getClientOrders).mock.calls[0][0]?.offset).toBe(20);
    await act(async () => harness.renderer.unmount());
  });

});
jest.mock('../src/shared/monitoring', () => ({ captureException: jest.fn(), addMonitoringBreadcrumb: jest.fn() }));
