import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

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
  Platform: { OS: 'ios' },
}));

jest.mock('@/utils/clientOrdersService', () => ({
  cancelClientOrder: jest.fn(),
  copyClientOrder: jest.fn(),
  createClientOrder: jest.fn(),
  deleteClientOrder: jest.fn(),
  getClientOrderDefaults: jest.fn(),
  getClientOrder: jest.fn(),
  getClientOrderProductsBatch: jest.fn(),
  getClientOrderSettings: jest.fn(),
  getClientOrders: jest.fn(),
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
import {
  createClientOrder,
  getClientOrder,
  getClientOrderDefaults,
  getClientOrderSettings,
  getClientOrders,
  submitClientOrder,
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
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.mocked(getClientOrderSettings).mockResolvedValue(settings as any);
  });

  afterEach(() => {
    jest.useRealTimers();
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

    expect(getClientOrder).toHaveBeenCalledTimes(1);
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

    expect(workspace!.orders.map((order) => order.guid).sort()).toEqual(['draft-guid', 'ship-guid']);

    await act(async () => {
      workspace!.setFilters((prev) => ({
        ...prev,
        statuses: ['DRAFT'],
        warehouseGuid: 'warehouse-a',
      }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
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
      deliveryMethods: [
        { code: 'ДоКлиента', name: 'ДоКлиента', label: 'Наша доставка' },
        { code: 'Самовывоз', name: 'Самовывоз', label: 'Самовывоз' },
      ],
      currency: 'RUB',
      deliveryDate: '2026-06-30T00:00:00.000Z',
      warnings: [],
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

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('keeps legacy payment and delivery values from an opened 1C document', async () => {
    jest.mocked(getClientOrders).mockResolvedValue({
      items: [],
      meta: { total: 0, limit: 20, offset: 0, statusCounts: {}, liveSource: { status: 'ok' } },
    } as any);
    jest.mocked(getClientOrderDefaults).mockResolvedValue({
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
    } as any);
    jest.mocked(getClientOrder).mockResolvedValue(queuedOrder(0, {
      guid: 'legacy-order-guid',
      origin: 'onec',
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

    expect(workspace!.draft.paymentForm).toBe('Безналичная');
    expect(workspace!.draft.deliveryMethod).toBe('СиламиПеревозчика');

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
    jest.mocked(createClientOrder).mockResolvedValue(savedOrder as any);

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

    expect(createClientOrder).toHaveBeenCalledWith(expect.objectContaining({
      deliveryAddressGuid: 'address-manual',
    }));
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
    jest.mocked(createClientOrder).mockResolvedValue(savedOrder as any);
    jest.mocked(submitClientOrder).mockResolvedValue(submittedOrder as any);

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

    expect(createClientOrder).toHaveBeenCalledTimes(1);
    expect(submitClientOrder).toHaveBeenCalledWith('new-order-guid', 1);
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
});
